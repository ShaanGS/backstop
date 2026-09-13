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

/**
 * Fixture runs keep their own ledger. The eval suite calls resetLedger() to
 * start each scenario clean, and pointing that at the live file meant running
 * the suite erased the record of every real send — after which Keel would
 * happily email a customer it had already emailed. Fixture state never touches
 * live state.
 */
function ledgerPath(): string {
  const name = process.env.KEEL_SINK === "1" ? "actions.fixture.json" : "actions.json";
  return join(process.cwd(), ".keel", name);
}

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
  const path = ledgerPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, LedgerEntry>;
  } catch {
    return {};
  }
}

function save(ledger: Record<string, LedgerEntry>) {
  const path = ledgerPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2), "utf8");
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

/**
 * When this account was last contacted *by Keel*.
 *
 * The seed data carries a `contactedDaysAgo` for touches that happened before
 * Keel existed, but a cooldown that only reads seed data is not a cooldown: it
 * would let Keel email a customer, and email them again a minute later, because
 * the file still says nobody ever has. The ledger holds only executed writes,
 * which makes it the honest record of outbound contact.
 */
export function lastContactAt(accountId: string, customerFacing: ActionType[]): string | undefined {
  const times = Object.values(load())
    .filter((e) => e.accountId === accountId && customerFacing.includes(e.actionType))
    .map((e) => e.executedAt)
    .sort();
  return times.at(-1);
}
