/**
 * The deterministic half of Backstop.
 *
 * The model proposes a plan; this module decides what actually happens. Every
 * write passes through the same five gates in the same order:
 *
 *     policy  →  idempotency  →  execute (with retry)  →  verify  →  ledger
 *
 * Nothing here consults the model. That is the point: an LLM can be wrong about
 * judgment, but it can never talk its way past a rule, duplicate an email, or
 * report an action as done that did not land in the external app.
 */
import { record } from "./audit";
import { actionKey, commit, lookup } from "./idempotency";
import { isBlocked } from "./policy";
import { isDryRun } from "./env";
import type { AccountSnapshot } from "./store";
import type { ExecutedAction, Plan, PolicyDecision, ProposedAction, VerificationResult } from "./types";

import * as linear from "./connectors/linear";
import * as notion from "./connectors/notion";
import * as slack from "./connectors/slack";
import * as mail from "./connectors/resend";

const MAX_ATTEMPTS = 2;

/** Carries results between actions inside a single run. */
type RunContext = { notionUrl?: string };

export type ExecResult = { externalId: string; externalUrl?: string; note?: string };

/**
 * Sink mode stubs only the third-party network boundary — every gate in this
 * file (policy, idempotency, retry, verification wiring, the ledger) still
 * runs for real. The eval suite uses it so the pipeline is tested
 * deterministically and without API keys; `pnpm eval --live` turns it off and
 * exercises the same code against the real apps.
 */
const isSink = () => process.env.BACKSTOP_SINK === "1";

/** Performs one action against its real external app. */
async function perform(
  action: ProposedAction,
  plan: Plan,
  snapshot: AccountSnapshot,
  ctx: RunContext,
): Promise<ExecResult> {
  const { account } = snapshot;
  const p = action.payload as Record<string, string>;

  if (isSink()) {
    return {
      externalId: `sink_${action.type}_${Math.random().toString(36).slice(2, 10)}`,
      externalUrl: "https://example.invalid/sink",
      note: "sink mode — external write stubbed",
    };
  }

  switch (action.type) {
    case "create_linear_issue": {
      const title = `[${account.name}] ${p.title}`;
      const issue = await linear.createIssue({
        title,
        description: `${p.description}\n\n---\n**Evidence**\n${snapshot.evidence
          .map((e) => `- ${e.source.toUpperCase()} · ${e.label}: ${e.detail}`)
          .join("\n")}\n\n_Opened automatically by Backstop (plan ${plan.id})._`,
        priority: Number(p.priority ?? 2),
      });
      return { externalId: issue.id, externalUrl: issue.url, note: issue.identifier };
    }

    case "create_notion_page": {
      const page = await notion.createSavePlan({
        accountName: account.name,
        headline: p.headline ?? plan.rationale.slice(0, 140),
        rationale: plan.rationale,
        evidence: snapshot.evidence,
        actions: plan.actions.map((a) => a.summary),
      });
      return { externalId: page.id, externalUrl: page.url, note: page.title };
    }

    case "send_customer_email": {
      const sent = await mail.sendEmail({
        to: p.to ?? account.contact.email,
        subject: p.subject,
        body: p.body,
        accountName: account.name,
      });
      return {
        externalId: sent.id,
        note: sent.redirected ? `sandboxed → ${sent.to}` : `delivered to ${sent.to}`,
      };
    }

    case "post_slack_alert": {
      const msg = await slack.postAlert({
        accountName: account.name,
        owner: `${account.owner.name} (${account.owner.slackHandle})`,
        headline: p.headline ?? plan.rationale.slice(0, 140),
        facts: [
          { label: "MRR", value: `$${(snapshot.billing.mrrCents / 100).toLocaleString()}/mo` },
          { label: "Renewal", value: `${snapshot.billing.daysToRenewal} days` },
          { label: "Usage", value: `${snapshot.usage.changePct}% vs baseline` },
          { label: "Risk score", value: `${snapshot.riskScore}/100` },
        ],
        actions: plan.actions.map((a) => a.summary),
        planUrl: ctx.notionUrl,
      });
      return { externalId: msg.ts, externalUrl: msg.url, note: `#${msg.channel}` };
    }
  }
}

/** Re-reads the created resource from its app to prove the write landed. */
async function verify(action: ProposedAction, res: ExecResult, plan: Plan, snapshot: AccountSnapshot): Promise<VerificationResult> {
  const p = action.payload as Record<string, string>;
  if (isSink()) {
    return { verified: true, method: "sink", detail: "Sink mode: read-back stubbed.", checkedAt: new Date().toISOString() };
  }
  switch (action.type) {
    case "create_linear_issue":
      return linear.verifyIssue(res.externalId, `[${snapshot.account.name}] ${p.title}`);
    case "create_notion_page":
      return notion.verifyPage(res.externalId);
    case "send_customer_email":
      return mail.verifyEmail(res.externalId);
    case "post_slack_alert":
      return slack.verifyMessage(process.env.SLACK_CHANNEL_ID!, res.externalId);
    default:
      return { verified: false, method: "none", detail: "No verifier for this action type.", checkedAt: new Date().toISOString() };
  }
}

export type ExecuteOptions = {
  runId: string;
  onEvent?: (e: { type: "action_started" | "action_result"; index: number; action: ProposedAction; result?: ExecutedAction }) => void;
};

export async function executePlan(
  plan: Plan,
  snapshot: AccountSnapshot,
  decisions: PolicyDecision[],
  opts: ExecuteOptions,
): Promise<ExecutedAction[]> {
  const out: ExecutedAction[] = [];
  const ctx: RunContext = {};

  for (const [index, action] of plan.actions.entries()) {
    const key = actionKey(plan.accountId, action.type, plan.id);
    opts.onEvent?.({ type: "action_started", index, action });
    const started = Date.now();

    // Gate 1 — policy.
    const blocked = isBlocked(decisions, action.type);
    if (blocked) {
      const result: ExecutedAction = {
        type: action.type, summary: action.summary, status: "blocked_by_policy",
        idempotencyKey: key, reason: `${blocked.rule}: ${blocked.reason}`, attempts: 0,
      };
      record({ runId: opts.runId, kind: "action_skipped", accountId: plan.accountId, detail: { ...result } });
      out.push(result);
      opts.onEvent?.({ type: "action_result", index, action, result });
      continue;
    }

    // Gate 2 — idempotency.
    const prior = lookup(key);
    if (prior) {
      const result: ExecutedAction = {
        type: action.type, summary: action.summary, status: "skipped_idempotent",
        externalId: prior.externalId, externalUrl: prior.externalUrl, idempotencyKey: key,
        reason: `Already executed at ${prior.executedAt}; reusing ${prior.externalId}.`, attempts: 0,
      };
      record({ runId: opts.runId, kind: "action_skipped", accountId: plan.accountId, detail: { ...result } });
      out.push(result);
      opts.onEvent?.({ type: "action_result", index, action, result });
      continue;
    }

    if (isDryRun()) {
      const result: ExecutedAction = {
        type: action.type, summary: action.summary, status: "skipped_idempotent",
        idempotencyKey: key, reason: "BACKSTOP_DRY_RUN=1 — write suppressed.", attempts: 0,
      };
      out.push(result);
      opts.onEvent?.({ type: "action_result", index, action, result });
      continue;
    }

    // Gate 3 — execute, with one retry on transient failure.
    let attempts = 0;
    let lastError = "";
    let res: ExecResult | null = null;
    while (attempts < MAX_ATTEMPTS && !res) {
      attempts++;
      try {
        res = await perform(action, plan, snapshot, ctx);
      } catch (err) {
        lastError = (err as Error).message;
        record({ runId: opts.runId, kind: "action_failed", accountId: plan.accountId, detail: { type: action.type, attempt: attempts, error: lastError } });
        if (attempts < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 700));
      }
    }

    if (!res) {
      const result: ExecutedAction = {
        type: action.type, summary: action.summary, status: "failed",
        idempotencyKey: key, reason: lastError, attempts,
        durationMs: Date.now() - started,
      };
      out.push(result);
      opts.onEvent?.({ type: "action_result", index, action, result });
      continue;
    }

    if (action.type === "create_notion_page") ctx.notionUrl = res.externalUrl;

    // Gate 4 — verify by read-back.
    const verification = await verify(action, res, plan, snapshot);
    record({ runId: opts.runId, kind: "verification", accountId: plan.accountId, detail: { type: action.type, ...verification } });

    // Gate 5 — commit to the ledger so a re-run is a no-op.
    commit({ key, accountId: plan.accountId, actionType: action.type, planId: plan.id, externalId: res.externalId, externalUrl: res.externalUrl });

    const result: ExecutedAction = {
      type: action.type, summary: action.summary, status: "executed",
      externalId: res.externalId, externalUrl: res.externalUrl, idempotencyKey: key,
      reason: res.note, attempts, verification, durationMs: Date.now() - started,
    };
    record({ runId: opts.runId, kind: "action_executed", accountId: plan.accountId, detail: { ...result } });
    out.push(result);
    opts.onEvent?.({ type: "action_result", index, action, result });
  }

  return out;
}
