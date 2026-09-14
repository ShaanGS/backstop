/**
 * The ledger — everything Keel has ever done, reconstructed from disk.
 *
 * The console is a conversation and conversations are forgotten. But a system
 * trusted with irreversible actions has to answer "what did you do, to whom,
 * and how do you know it landed?" long after the tab is closed. Both files it
 * needs already exist: the append-only audit trail and the idempotency ledger.
 * Nothing here writes; it only reads what execution already committed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAudit } from "./audit";
import { listAccounts } from "./store";
import type { RunMetrics } from "./telemetry";
import type { ActionType, AuditEvent, ConnectorId } from "./types";

/** Which app an action lands in. One definition, used by every surface. */
export const ACTION_APP: Record<ActionType, ConnectorId> = {
  create_linear_issue: "linear",
  create_notion_page: "notion",
  send_customer_email: "resend",
  post_slack_alert: "slack",
};

export const ACTION_VERB: Record<ActionType, string> = {
  create_linear_issue: "Recovery task",
  create_notion_page: "Save-plan doc",
  send_customer_email: "Customer email",
  post_slack_alert: "Owner alert",
};

export type LedgerStatus = "executed" | "skipped_idempotent" | "blocked_by_policy" | "failed";

export type LedgerEntry = {
  ts: string;
  runId: string;
  accountId: string;
  accountName: string;
  type: ActionType;
  app: ConnectorId;
  summary: string;
  status: LedgerStatus;
  externalId?: string;
  externalUrl?: string;
  idempotencyKey?: string;
  verified?: boolean;
  verifyDetail?: string;
  attempts?: number;
  reason?: string;
};

export type LedgerSummary = {
  total: number;
  executed: number;
  verified: number;
  blocked: number;
  skipped: number;
  failed: number;
  runs: number;
  apps: ConnectorId[];
  firstAt?: string;
  lastAt?: string;
};

const ACTION_KINDS = new Set(["action_executed", "action_skipped", "action_failed"]);

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export function readLedger(): { entries: LedgerEntry[]; summary: LedgerSummary } {
  const audit = readAudit();
  const names = new Map(listAccounts().map((a) => [a.id, a.name]));

  /* Verification is recorded as its own event, keyed by run + action type, so
     fold it in rather than showing an executed row with no proof beside it. */
  const verifications = new Map<string, { ok: boolean; detail?: string }>();
  for (const e of audit) {
    if (e.kind !== "verification") continue;
    const type = str(e.detail.type);
    if (!type) continue;
    verifications.set(`${e.runId}:${type}`, {
      ok: e.detail.verified === true,
      detail: str(e.detail.detail) ?? str(e.detail.method),
    });
  }

  const entries: LedgerEntry[] = [];
  for (const e of audit as AuditEvent[]) {
    if (!ACTION_KINDS.has(e.kind)) continue;
    const type = str(e.detail.type) as ActionType | undefined;
    if (!type || !(type in ACTION_APP)) continue;

    const status = (str(e.detail.status) ??
      (e.kind === "action_failed" ? "failed" : "executed")) as LedgerStatus;
    const v = verifications.get(`${e.runId}:${type}`);
    const accountId = e.accountId ?? "";

    entries.push({
      ts: e.ts,
      runId: e.runId,
      accountId,
      accountName: names.get(accountId) ?? accountId,
      type,
      app: ACTION_APP[type],
      summary: str(e.detail.summary) ?? ACTION_VERB[type],
      status,
      externalId: str(e.detail.externalId),
      externalUrl: str(e.detail.externalUrl),
      idempotencyKey: str(e.detail.idempotencyKey),
      verified: status === "executed" ? v?.ok : undefined,
      verifyDetail: v?.detail,
      attempts: typeof e.detail.attempts === "number" ? e.detail.attempts : undefined,
      reason: str(e.detail.reason) ?? str(e.detail.error),
    });
  }

  /* A failed attempt followed by a success is one action, not two: keep the
     terminal state per (run, action) so a retry doesn't read as a duplicate. */
  const byAction = new Map<string, LedgerEntry>();
  for (const entry of entries) byAction.set(`${entry.runId}:${entry.type}`, entry);
  const rows = [...byAction.values()].sort((a, b) => b.ts.localeCompare(a.ts));

  const summary: LedgerSummary = {
    total: rows.length,
    executed: rows.filter((r) => r.status === "executed").length,
    verified: rows.filter((r) => r.verified).length,
    blocked: rows.filter((r) => r.status === "blocked_by_policy").length,
    skipped: rows.filter((r) => r.status === "skipped_idempotent").length,
    failed: rows.filter((r) => r.status === "failed").length,
    runs: new Set(rows.map((r) => r.runId)).size,
    apps: [...new Set(rows.filter((r) => r.status === "executed").map((r) => r.app))],
    firstAt: rows.at(-1)?.ts,
    lastAt: rows[0]?.ts,
  };
  return { entries: rows, summary };
}

/**
 * The eval scorecard, read from the report the suite writes. Reported rather
 * than asserted: if the suite has never run, the UI says so instead of
 * claiming a pass rate nobody produced.
 */
export function readEvalScore(): { passed: number; total: number; mustNot: number } | null {
  try {
    const md = readFileSync(join(process.cwd(), "evals", "REPORT.md"), "utf8");
    const m = md.match(/\*\*(\d+)\/(\d+) cases passed\*\*[\s\S]*?\*\*(\d+)\/\d+ must-not-act/);
    if (!m) return null;
    return { passed: Number(m[1]), total: Number(m[2]), mustNot: Number(m[3]) };
  } catch {
    return null;
  }
}


/* ── run telemetry ─────────────────────────────────────────────────────── */

export type RunMetricsRow = RunMetrics & { runId: string; ts: string; accountName: string };

export type MetricsSummary = {
  runs: number;
  /** Median, not mean: one slow cold start should not define the typical run. */
  investigateMs: number;
  executeMs: number;
  tokens: number;
  steps: number;
  /** Share of input tokens served from the prompt cache, 0-1. */
  cacheHitRate: number;
  /** Summed across runs. Present only when the operator configured rates. */
  estimatedCostUsd?: number;
  latest?: RunMetricsRow;
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * What runs actually cost, rebuilt from the audit trail like everything else
 * here. Runs parked at the approval gate report executeMs 0 — real, and the
 * reason the two phases are timed separately rather than summed.
 */
export function readRunMetrics(): { rows: RunMetricsRow[]; summary: MetricsSummary } {
  const names = new Map(listAccounts().map((a) => [a.id, a.name]));
  const rows: RunMetricsRow[] = [];

  for (const e of readAudit()) {
    if (e.kind !== "run_metrics") continue;
    const d = e.detail;
    rows.push({
      runId: e.runId,
      ts: e.ts,
      accountName: names.get(e.accountId ?? "") ?? e.accountId ?? "—",
      model: str(d.model) ?? "unknown",
      steps: num(d.steps),
      toolCalls: num(d.toolCalls),
      inputTokens: num(d.inputTokens),
      outputTokens: num(d.outputTokens),
      cachedInputTokens: num(d.cachedInputTokens),
      investigateMs: num(d.investigateMs),
      executeMs: num(d.executeMs),
      totalMs: num(d.totalMs),
      estimatedCostUsd: typeof d.estimatedCostUsd === "number" ? d.estimatedCostUsd : undefined,
    });
  }
  rows.sort((a, b) => b.ts.localeCompare(a.ts));

  const priced = rows.filter((r) => r.estimatedCostUsd !== undefined);
  const totalIn = rows.reduce((n, r) => n + r.inputTokens, 0);
  const totalCached = rows.reduce((n, r) => n + r.cachedInputTokens, 0);

  return {
    rows,
    summary: {
      runs: rows.length,
      investigateMs: median(rows.map((r) => r.investigateMs)),
      /* Only runs that reached phase 2 say anything about how long phase 2 takes. */
      executeMs: median(rows.filter((r) => r.executeMs > 0).map((r) => r.executeMs)),
      tokens: median(rows.map((r) => r.inputTokens + r.outputTokens)),
      steps: median(rows.map((r) => r.steps)),
      cacheHitRate: totalIn ? totalCached / totalIn : 0,
      estimatedCostUsd: priced.length
        ? Math.round(priced.reduce((n, r) => n + (r.estimatedCostUsd ?? 0), 0) * 10_000) / 10_000
        : undefined,
      latest: rows[0],
    },
  };
}
