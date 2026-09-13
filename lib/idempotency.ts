/**
 * Idempotency ledger.
 *
 * Every write is keyed by (accountId, actionType, planId). Before executing we
 * look the key up; if it resolved before, we skip and report the original
 * external resource instead of creating a duplicate. This is what makes
 * re-running a save play a no-op rather than a second email to the customer.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ActionType } from "./types";

const LEDGER_PATH = join(process.cwd(), ".backstop", "actions.json");

export type LedgerEntry = {
  key: string;
  accountId: string;
  actionType: ActionType;
  planId: string;
  externalId: string;
  externalUrl?: string;
  executedAt: string;
};

export function actionKey(accountId: string, actionType: ActionType, planId: string): string {
  return createHash("sha256").update(`${accountId}:${actionType}:${planId}`).digest("hex").slice(0, 32);
}

function load(): Record<string, LedgerEntry> {
  if (!existsSync(LEDGER_PATH)) return {};
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<string, LedgerEntry>;
  } catch {
    return {};
  }
}

function save(ledger: Record<string, LedgerEntry>) {
  const dir = dirname(LEDGER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

export function lookup(key: string): LedgerEntry | undefined {
  return load()[key];
}

export function commit(entry: Omit<LedgerEntry, "executedAt">): LedgerEntry {
  const ledger = load();
  const full: LedgerEntry = { ...entry, executedAt: new Date().toISOString() };
  ledger[entry.key] = full;
  save(ledger);
  return full;
}

/** Test-only: clear the ledger so a scenario can run from a clean slate. */
export function resetLedger() {
  save({});
}
