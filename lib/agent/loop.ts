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
import { dirname, join } from "node:path";
import { newRunId, record } from "../audit";
import { executePlan } from "../execute";
import { evaluatePolicy, requiresApproval, survivingActions } from "../policy";
import { buildSnapshot, type AccountSnapshot } from "../store";
import type { ExecutedAction, Plan, PolicyDecision, ProposedAction } from "../types";
import { SYSTEM_PROMPT } from "./system-prompt";
import { buildTools, type ProposalSink } from "./tools";

export const MODEL = process.env.BACKSTOP_MODEL ?? "claude-opus-5";

export type AgentEvent =
  | { type: "run_started"; runId: string; at: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; summary: string }
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
  riskScore: number;
  riskReasons: string[];
  mrrCents: number;
  daysToRenewal: number;
  usageChangePct: number;
  tags: string[];
  evidence: AccountSnapshot["evidence"];
};

function toDTO(s: AccountSnapshot): SnapshotDTO {
  return {
    accountId: s.account.id,
    name: s.account.name,
    riskScore: s.riskScore,
    riskReasons: s.riskReasons,
    mrrCents: s.billing.mrrCents,
    daysToRenewal: s.billing.daysToRenewal,
    usageChangePct: s.usage.changePct,
    tags: s.account.tags,
    evidence: s.evidence,
  };
}

export type Emit = (e: AgentEvent) => void;

/* ── pending-approval store ────────────────────────────────────────────── */

const PENDING_PATH = join(process.cwd(), ".backstop", "pending.json");
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

/* ── phase 1: model-driven investigation ───────────────────────────────── */

export async function investigate(
  emit: Emit,
  opts: { runId: string; instruction: string },
): Promise<Plan> {
  const sink: ProposalSink = { plan: null };
  const tools = buildTools(sink, (name, summary) =>
    record({ runId: opts.runId, kind: "tool_read", detail: { name, summary } }),
  );

  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    prompt: opts.instruction,
    tools,
    stopWhen: stepCountIs(12),
    temperature: 0.2,
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") emit({ type: "thinking_delta", text: part.text });
    else if (part.type === "tool-call") {
      emit({ type: "tool_call", id: part.toolCallId, name: part.toolName, args: part.input });
    } else if (part.type === "tool-result") {
      const out = part.output as Record<string, unknown>;
      let summary = "ok";
      if (part.toolName === "list_accounts") summary = `${(out.accounts as unknown[])?.length ?? 0} accounts`;
      else if (part.toolName === "get_account_snapshot") {
        const acct = out.account as { name?: string } | undefined;
        summary = `${acct?.name ?? "account"} · risk ${out.riskScore}/100`;
      } else if (part.toolName === "propose_save_play") summary = `${out.actionCount} actions proposed`;
      emit({ type: "tool_result", id: part.toolCallId, name: part.toolName, summary });
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
  const entry = getPending(planId);
  if (!entry) throw new Error(`No plan awaiting approval with id ${planId}.`);
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
