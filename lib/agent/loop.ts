/**
 * Orchestration: the seam between model judgment and deterministic execution.
 *
 * Phase 1 is a real tool-calling loop — the model decides which accounts to
 * open, how deep to dig, and what the play should be. Phase 2 never asks the
 * model anything: policy, the approval gate, idempotency, execution and
 * verification are all code.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs, streamText } from "ai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { statePath } from "../paths";
import { newRunId, record } from "../audit";
import { executePlan } from "../execute";
import { evaluatePolicy, requiresApproval, survivingActions } from "../policy";
import { buildSnapshot, type AccountSnapshot } from "../store";
import type { ExecutedAction, Plan, PolicyDecision, ProposedAction } from "../types";
import { SYSTEM_PROMPT } from "./system-prompt";
import { buildTools, type ProposalSink } from "./tools";

export const MODEL = process.env.KEEL_MODEL ?? "claude-opus-5";

export type AgentEvent =
  | { type: "run_started"; runId: string; at: string }
  | { type: "thinking_delta"; text: string }
  | { type: "evidence"; items: AccountSnapshot["evidence"] }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; summary: string; details?: string[] }
  | { type: "plan"; plan: Plan; snapshot: SnapshotDTO }
  | { type: "policy"; decisions: PolicyDecision[] }
  | { type: "awaiting_approval"; planId: string; rule: string; reason: string; actions: ProposedAction[] }
  | { type: "action_started"; index: number; action: ProposedAction }
  | { type: "action_result"; index: number; result: ExecutedAction }
  | { type: "run_finished"; runId: string; executed: number; skipped: number; blocked: number; failed: number }
  | { type: "error"; message: string };

export type SnapshotDTO = {
  accountId: string;
  name: string;
  domain: string;
  owner: string;
  contact: string;
  riskScore: number;
  riskReasons: string[];
  mrrCents: number;
  status: string;
  daysToRenewal: number;
  failedPaymentCents: number | null;
  usage: AccountSnapshot["usage"];
  tickets: AccountSnapshot["tickets"];
  tags: string[];
  evidence: AccountSnapshot["evidence"];
};

function toDTO(s: AccountSnapshot): SnapshotDTO {
  return {
    accountId: s.account.id,
    name: s.account.name,
    domain: s.account.domain,
    owner: s.account.owner.name,
    contact: `${s.account.contact.name} · ${s.account.contact.role}`,
    riskScore: s.riskScore,
    riskReasons: s.riskReasons,
    mrrCents: s.billing.mrrCents,
    status: s.billing.status,
    daysToRenewal: s.billing.daysToRenewal,
    failedPaymentCents: s.billing.failedPaymentCents ?? null,
    usage: s.usage,
    tickets: s.tickets,
    tags: s.account.tags,
    evidence: s.evidence,
  };
}

export type Emit = (e: AgentEvent) => void;

/* ── pending-approval store ────────────────────────────────────────────── */

const PENDING_PATH = statePath("pending.json");
const COMPLETED_PATH = statePath("completed.json");
type Pending = Record<string, { plan: Plan; runId: string }>;

function readPending(): Pending {
  if (!existsSync(PENDING_PATH)) return {};
  try { return JSON.parse(readFileSync(PENDING_PATH, "utf8")) as Pending; } catch { return {}; }
}
function writePending(p: Pending) {
  const dir = dirname(PENDING_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PENDING_PATH, JSON.stringify(p, null, 2), "utf8");
}
export function getPending(planId: string) { return readPending()[planId]; }

/* Plans that have already run are retained so they can be REPLAYED. Replaying a
 * plan is the real test of idempotency: the same plan id yields the same action
 * keys, so every write is recognised and skipped. (A fresh investigation is a
 * different thing — it mints a new plan, and is allowed to act, because the
 * account's state may genuinely have moved on.) */
function readCompleted(): Pending {
  if (!existsSync(COMPLETED_PATH)) return {};
  try { return JSON.parse(readFileSync(COMPLETED_PATH, "utf8")) as Pending; } catch { return {}; }
}
function writeCompleted(p: Pending) {
  const dir = dirname(COMPLETED_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(COMPLETED_PATH, JSON.stringify(p, null, 2), "utf8");
}
export function getCompleted(planId: string) { return readCompleted()[planId]; }

function markCompleted(plan: Plan, runId: string) {
  const done = readCompleted();
  done[plan.id] = { plan, runId };
  writeCompleted(done);
}

/* ── phase 1: model-driven investigation ───────────────────────────────── */

export async function investigate(
  emit: Emit,
  opts: { runId: string; instruction: string },
): Promise<Plan> {
  const sink: ProposalSink = { plan: null };
  const tools = buildTools(
    sink,
    (name, summary) => record({ runId: opts.runId, kind: "tool_read", detail: { name, summary } }),
    (items) => {
      record({ runId: opts.runId, kind: "evidence", detail: { count: items.length } });
      emit({ type: "evidence", items });
    },
  );

  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    prompt: opts.instruction,
    tools,
    stopWhen: stepCountIs(12),
    temperature: 0.2,
  });

  // The model speaks, calls a tool, then speaks again — each is its own text
  // block. Without a separator they concatenate into one run-on sentence, so
  // open a paragraph break whenever a new block starts after the first.
  let spoken = false;
  for await (const part of result.fullStream) {
    if (part.type === "text-start") {
      if (spoken) emit({ type: "thinking_delta", text: "\n\n" });
    } else if (part.type === "text-delta") {
      if (part.text) spoken = true;
      emit({ type: "thinking_delta", text: part.text });
    }
    else if (part.type === "tool-call") {
      emit({ type: "tool_call", id: part.toolCallId, name: part.toolName, args: part.input });
    } else if (part.type === "tool-result") {
      const out = part.output as Record<string, unknown>;
      let summary = "ok";
      let details: string[] | undefined;

      if (part.toolName === "list_accounts") {
        const rows = (out.accounts ?? []) as { name: string; usageChangePct: number; tags: string[] }[];
        summary = `${rows.length} accounts`;
        details = rows.map((a) => `${a.name} — usage ${a.usageChangePct > 0 ? "+" : ""}${a.usageChangePct}%${a.tags.length ? ` · ${a.tags.join(", ")}` : ""}`);
      } else if (part.toolName === "get_account_snapshot") {
        const acct = out.account as { name?: string } | undefined;
        const billing = out.billing as { mrr?: string; daysToRenewal?: number; failedPayment?: string | null } | undefined;
        const usage = out.usage as { changePct?: number; currentWeeklyActiveSeats?: number; baselineWeeklyActiveSeats?: number } | undefined;
        const tickets = (out.tickets ?? []) as { identifier: string; title: string; state: string }[];
        summary = `risk ${out.riskScore}/100`;
        details = [
          `${billing?.mrr} · renews in ${billing?.daysToRenewal} days`,
          `seats ${usage?.currentWeeklyActiveSeats} of ${usage?.baselineWeeklyActiveSeats} (${usage?.changePct}%)`,
          ...(billing?.failedPayment ? [`billing — ${billing.failedPayment}`] : []),
          ...tickets.map((t) => `${t.identifier} — ${t.title} (${t.state})`),
          ...((out.riskReasons ?? []) as string[]),
        ];
        summary = `${acct?.name ?? "account"} · risk ${out.riskScore}/100`;
      } else if (part.toolName === "propose_save_play") {
        summary = `${out.actionCount} actions proposed`;
        const dropped = (out.droppedUnconfigured ?? []) as string[];
        if (dropped.length) details = [`dropped, connector not configured: ${dropped.join(", ")}`];
      }
      emit({ type: "tool_result", id: part.toolCallId, name: part.toolName, summary, details });
    } else if (part.type === "error") {
      throw new Error(String((part as { error: unknown }).error));
    }
  }

  if (!sink.plan) throw new Error("The agent finished without proposing a save play.");
  return sink.plan;
}

/* ── phase 2: deterministic execution ──────────────────────────────────── */

async function runPipeline(
  emit: Emit,
  plan: Plan,
  snapshot: AccountSnapshot,
  decisions: PolicyDecision[],
  runId: string,
) {
  const results = await executePlan(plan, snapshot, decisions, {
    runId,
    onEvent: (e) => {
      if (e.type === "action_started") emit({ type: "action_started", index: e.index, action: e.action });
      else if (e.result) emit({ type: "action_result", index: e.index, result: e.result });
    },
  });

  const tally = {
    executed: results.filter((r) => r.status === "executed").length,
    skipped: results.filter((r) => r.status === "skipped_idempotent").length,
    blocked: results.filter((r) => r.status === "blocked_by_policy").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
  markCompleted(plan, runId);
  record({ runId, kind: "run_finished", accountId: plan.accountId, detail: tally });
  emit({ type: "run_finished", runId, ...tally });
  return results;
}

/** Full run: investigate, police, then either execute or park for approval. */
export async function runAgent(emit: Emit, opts: { instruction: string; runId?: string }) {
  const runId = opts.runId ?? newRunId();
  emit({ type: "run_started", runId, at: new Date().toISOString() });
  record({ runId, kind: "run_started", detail: { instruction: opts.instruction, model: MODEL } });

  const plan = await investigate(emit, { runId, instruction: opts.instruction });

  // Re-read the account at decision time and attach the evidence the plan rests on.
  const snapshot = await buildSnapshot(plan.accountId);
  plan.evidence = snapshot.evidence;
  record({ runId, kind: "plan_proposed", accountId: plan.accountId, detail: { planId: plan.id, actions: plan.actions.map((a) => a.type), rationale: plan.rationale } });
  emit({ type: "plan", plan, snapshot: toDTO(snapshot) });

  const decisions = evaluatePolicy(snapshot, plan);
  record({ runId, kind: "policy_evaluated", accountId: plan.accountId, detail: { decisions } });
  emit({ type: "policy", decisions });

  const gate = requiresApproval(decisions, plan);
  if (gate && survivingActions(decisions, plan).length) {
    const pending = readPending();
    pending[plan.id] = { plan, runId };
    writePending(pending);
    record({ runId, kind: "approval_requested", accountId: plan.accountId, detail: { planId: plan.id, rule: gate.rule } });
    emit({
      type: "awaiting_approval",
      planId: plan.id,
      rule: gate.rule,
      reason: gate.reason,
      actions: survivingActions(decisions, plan),
    });
    return { plan, snapshot, decisions, awaitingApproval: true as const };
  }

  await runPipeline(emit, plan, snapshot, decisions, runId);
  return { plan, snapshot, decisions, awaitingApproval: false as const };
}

/** Resumes a parked plan once a human has signed off (or rejected it). */
export async function resumePlan(emit: Emit, planId: string, approved: boolean) {
  const entry = getPending(planId) ?? getCompleted(planId);
  if (!entry) throw new Error(`No plan found with id ${planId}.`);
  const { plan, runId } = entry;

  const pending = readPending();
  delete pending[planId];
  writePending(pending);

  if (!approved) {
    record({ runId, kind: "approval_denied", accountId: plan.accountId, detail: { planId } });
    emit({ type: "run_finished", runId, executed: 0, skipped: 0, blocked: plan.actions.length, failed: 0 });
    return;
  }

  record({ runId, kind: "approval_granted", accountId: plan.accountId, detail: { planId } });
  // Re-read state at execution time: approval may have been given minutes ago.
  const snapshot = await buildSnapshot(plan.accountId);
  plan.evidence = snapshot.evidence;
  const decisions = evaluatePolicy(snapshot, plan);
  emit({ type: "policy", decisions });
  await runPipeline(emit, plan, snapshot, decisions, runId);
}
