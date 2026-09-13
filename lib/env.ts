/**
 * Connector credential detection.
 *
 * Keel degrades gracefully: a connector without credentials is reported as
 * unconfigured rather than throwing, so the console always boots and the README
 * setup path is forgiving. Every *write* connector re-checks before acting.
 */
import type { ConnectorId } from "./types";

export const CONNECTOR_ENV: Record<ConnectorId, string[]> = {
  stripe: ["STRIPE_SECRET_KEY"],
  linear: ["LINEAR_API_KEY"],
  slack: ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"],
  notion: ["NOTION_API_KEY", "NOTION_PARENT_PAGE_ID"],
  resend: ["RESEND_API_KEY"],
};

export const CONNECTOR_META: Record<
  ConnectorId,
  { name: string; role: string; direction: "read" | "write" | "read+write"; whenMissing: string }
> = {
  stripe: {
    name: "Stripe",
    role: "Billing truth — MRR, renewal, failed payments",
    direction: "read",
    whenMissing: "Keel cannot see revenue at risk.",
  },
  linear: {
    name: "Linear",
    role: "Product signal, and the team's work queue",
    direction: "read+write",
    whenMissing: "No recovery task, and churn caused by a known bug looks like churn with no cause.",
  },
  slack: {
    name: "Slack",
    role: "The owner, now — approvals and refusals",
    direction: "write",
    whenMissing: "Approvals wait in a browser tab nobody has open, and refusals reach no one.",
  },
  notion: {
    name: "Notion",
    role: "The case record, for whoever inherits it",
    direction: "write",
    whenMissing: "The evidence lives only in the audit log — readable by machines, not by the next human.",
  },
  resend: {
    name: "Resend",
    role: "The customer — the only outbound touch",
    direction: "write",
    whenMissing: "Keel can diagnose a save play but never run one.",
  },
};

/** A value copied straight out of .env.example is not a credential. */
function isPlaceholder(value: string): boolean {
  const v = value.trim();
  return v === "" || v.endsWith("...") || v.startsWith("you@") || /^x{8,}$/i.test(v) || v === "C0XXXXXXXXX";
}

export function isConfigured(id: ConnectorId): boolean {
  return CONNECTOR_ENV[id].every((k) => {
    const v = process.env[k];
    return Boolean(v) && !isPlaceholder(v!);
  });
}

export function requireEnv(id: ConnectorId): void {
  const missing = CONNECTOR_ENV[id].filter((k) => {
    const v = process.env[k];
    return !v || isPlaceholder(v);
  });
  if (missing.length) {
    throw new Error(
      `Connector "${id}" is not configured. Missing: ${missing.join(", ")}. ` +
        `Add it to .env.local — see .env.example.`,
    );
  }
}

export function connectorStatus() {
  return (Object.keys(CONNECTOR_ENV) as ConnectorId[]).map((id) => ({
    id,
    ...CONNECTOR_META[id],
    configured: isConfigured(id),
  }));
}

/** Live mode performs real writes. Set KEEL_DRY_RUN=1 to trace without writing. */
export const isDryRun = () => process.env.KEEL_DRY_RUN === "1";
