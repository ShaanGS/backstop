/**
 * Run telemetry — what a run cost, in tokens and in time.
 *
 * An agent that takes irreversible actions is judged on two things nobody can
 * see from the transcript: how much model work it took to reach the decision,
 * and where the wall-clock went. Both are recorded here as measured facts.
 *
 * The split that matters is phase 1 against phase 2. Phase 1 is the model
 * investigating; phase 2 is policy, idempotency, execution and verification,
 * none of which consults the model. Keeping the two timings apart is what lets
 * anyone check the claim that the decision half is deterministic — deterministic
 * code has a latency profile that model calls do not.
 *
 * On cost: no dollar figure is printed unless the operator supplies the rates.
 * A price table baked into a repo is stale the week after it is written, and a
 * sourceless number on a dashboard is worse than no number. Set
 * KEEL_PRICE_INPUT_PER_MTOK and KEEL_PRICE_OUTPUT_PER_MTOK to turn it on.
 */
import type { LanguageModelUsage } from "ai";

export type RunMetrics = {
  model: string;
  /** Model round-trips the loop took. Bounded by stopWhen: stepCountIs(12). */
  steps: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache rather than re-read. */
  cachedInputTokens: number;
  /** Phase 1 — the model investigating. */
  investigateMs: number;
  /** Phase 2 — policy, idempotency, execution, verification. No model calls. */
  executeMs: number;
  totalMs: number;
  /** Present only when both rate env vars are set. Never guessed. */
  estimatedCostUsd?: number;
};

function rate(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Dollars for this run, or undefined when the operator has not supplied rates.
 * Cached input is billed below full input rate by every provider that offers
 * it, but the discount differs per provider — so cached tokens are reported
 * and excluded from the estimate rather than multiplied by a guessed factor.
 */
export function estimateCost(m: Pick<RunMetrics, "inputTokens" | "outputTokens" | "cachedInputTokens">): number | undefined {
  const inPer = rate("KEEL_PRICE_INPUT_PER_MTOK");
  const outPer = rate("KEEL_PRICE_OUTPUT_PER_MTOK");
  if (inPer === null || outPer === null) return undefined;
  const billableIn = Math.max(0, m.inputTokens - m.cachedInputTokens);
  const usd = (billableIn / 1_000_000) * inPer + (m.outputTokens / 1_000_000) * outPer;
  return Math.round(usd * 10_000) / 10_000;
}

/** The SDK reports every token field as `number | undefined`. Treat absent as 0. */
export function readUsage(u: LanguageModelUsage | undefined) {
  return {
    inputTokens: u?.inputTokens ?? 0,
    outputTokens: u?.outputTokens ?? 0,
    cachedInputTokens: u?.inputTokenDetails?.cacheReadTokens ?? 0,
  };
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
