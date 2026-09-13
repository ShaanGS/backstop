/**
 * The ledger — everything Keel has ever done, reconstructed from disk.
 *
 * The console is a conversation and conversations are forgotten. But a system
 * trusted with irreversible actions has to answer "what did you do, to whom,
 * and how do you know it landed?" long after the tab is closed. Both files it
 * needs already exist: the append-only audit trail and the idempotency ledger.
 * Nothing here writes; it only reads what execution already committed.
 */
import { readAudit } from "./audit";
import { listAccounts } from "./store";
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
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const md = readFileSync(join(process.cwd(), "evals", "REPORT.md"), "utf8");
    const m = md.match(/\*\*(\d+)\/(\d+) cases passed\*\*[\s\S]*?\*\*(\d+)\/\d+ must-not-act/);
    if (!m) return null;
    return { passed: Number(m[1]), total: Number(m[2]), mustNot: Number(m[3]) };
  } catch {
    return null;
  }
}
