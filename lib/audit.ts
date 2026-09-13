/**
 * Append-only audit log.
 *
 * Every read, decision, policy evaluation, action and verification lands here as
 * one JSON line. This file is the product's receipts: the UI timeline renders
 * from it and the eval harness asserts against it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { statePath } from "./paths";
import type { AuditEvent } from "./types";

/**
 * Fixture runs write to their own file. The eval suite executes the same
 * pipeline with the third-party network boundary stubbed, and those actions
 * never happened to a real customer — letting them share the live trail would
 * make the ledger claim work it never did. Read path: live only.
 */
function auditPath(): string {
  const name = process.env.KEEL_SINK === "1" ? "audit.fixture.jsonl" : "audit.jsonl";
  return statePath(name);
}

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function record(event: Omit<AuditEvent, "ts">): AuditEvent {
  const full: AuditEvent = { ts: new Date().toISOString(), ...event };
  const path = auditPath();
  ensureDir(path);
  appendFileSync(path, JSON.stringify(full) + "\n", "utf8");
  return full;
}

export function readAudit(runId?: string): AuditEvent[] {
  const path = auditPath();
  if (!existsSync(path)) return [];
  /* A process killed mid-append leaves a partial final line. Skipping it costs
     one event; throwing would cost the whole trail. */
  const all: AuditEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    try {
      all.push(JSON.parse(line) as AuditEvent);
    } catch {
      /* unreadable record — the rest of the trail is still good */
    }
  }
  return runId ? all.filter((e) => e.runId === runId) : all;
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
