/**
 * Where Keel keeps its state.
 *
 * Locally this is `.keel/` beside the source, which is durable: the audit trail
 * and the idempotency ledger survive restarts, which is what makes "this action
 * already happened" a real guarantee.
 *
 * On a serverless host the project directory is read-only and the only writable
 * path is /tmp, which lives and dies with the instance. Keel still runs there —
 * every gate executes — but the ledger is only as durable as the instance, so a
 * cold start can forget that an action was taken. That is a genuine weakening of
 * the idempotency guarantee, and the console says so rather than hiding it.
 */
import { join } from "node:path";

export const isEphemeralState = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export function stateDir(): string {
  if (process.env.KEEL_STATE_DIR) return process.env.KEEL_STATE_DIR;
  return isEphemeralState ? "/tmp/.keel" : join(process.cwd(), ".keel");
}

export function statePath(file: string): string {
  return join(stateDir(), file);
}
