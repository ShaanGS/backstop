/**
 * Append-only audit log.
 *
 * Every read, decision, policy evaluation, action and verification lands here as
 * one JSON line. This file is the product's receipts: the UI timeline renders
 * from it and the eval harness asserts against it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AuditEvent } from "./types";

const AUDIT_PATH = join(process.cwd(), ".keel", "audit.jsonl");

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function record(event: Omit<AuditEvent, "ts">): AuditEvent {
  const full: AuditEvent = { ts: new Date().toISOString(), ...event };
  ensureDir(AUDIT_PATH);
  appendFileSync(AUDIT_PATH, JSON.stringify(full) + "\n", "utf8");
  return full;
}

export function readAudit(runId?: string): AuditEvent[] {
  if (!existsSync(AUDIT_PATH)) return [];
  const all = readFileSync(AUDIT_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEvent);
  return runId ? all.filter((e) => e.runId === runId) : all;
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
