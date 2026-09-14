/** Core domain types for Keel. */

export type ConnectorId = "stripe" | "linear" | "slack" | "notion" | "resend";

export type Account = {
  id: string;
  name: string;
  domain: string;
  /** Customer Success Manager who owns the relationship. */
  owner: { name: string; email: string; slackHandle: string };
  /** Person we would actually email. */
  contact: { name: string; email: string; role: string };
  /** Behavioural / commercial labels. `do-not-contact` is policy-bearing. */
  tags: string[];
  stripeCustomerId: string;
  timezone: string;
  /** ISO timestamp of our last outbound touch, used by CONTACT_FREQUENCY. */
  lastContactedAt?: string;
};

export type Ticket = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  labels: string[];
  state: string;
  createdAt: string;
  /** When the customer actually reported it. Seeded tenancies are all created
   *  at seed time, so the intended report date is recovered from the issue
   *  body; falls back to createdAt for tickets Keel did not seed. */
  reportedAt?: string;
};

export type UsageSignal = {
  /** Weekly active seats for the trailing 8 weeks, oldest first. */
  series: number[];
  current: number;
  baseline: number;
  changePct: number;
};

export type BillingSignal = {
  mrrCents: number;
  currency: string;
  renewalDate: string;
  daysToRenewal: number;
  status: string;
  failedPaymentCents?: number;
  failedPaymentAt?: string;
  failedInvoiceUrl?: string;
};

/** A single retrieved fact, carrying the app it came from and a link back. */
export type Evidence = {
  id: string;
  /** Short, stable handle the model cites inline, e.g. "stripe-1". */
  key: string;
  source: ConnectorId | "usage";
  label: string;
  detail: string;
  url?: string;
  retrievedAt: string;
};

export type ActionType =
  | "create_linear_issue"
  | "create_notion_page"
  | "send_customer_email"
  | "post_slack_alert";

export type ProposedAction = {
  type: ActionType;
  /** Human-readable one-liner shown in the approval gate. */
  summary: string;
  payload: Record<string, unknown>;
};

export type PolicyOutcome = "allow" | "block" | "require_approval";

export type PolicyDecision = {
  rule: string;
  outcome: PolicyOutcome;
  reason: string;
  /** Which action types this decision constrains; empty = the whole plan. */
  appliesTo: ActionType[];
  evidence?: string;
};

export type Plan = {
  id: string;
  accountId: string;
  createdAt: string;
  rationale: string;
  evidence: Evidence[];
  actions: ProposedAction[];
};

export type VerificationResult = {
  verified: boolean;
  method: string;
  detail: string;
  checkedAt: string;
};

export type ExecutedAction = {
  type: ActionType;
  summary: string;
  status: "executed" | "skipped_idempotent" | "blocked_by_policy" | "failed";
  /** ID of the resource created in the external app. */
  externalId?: string;
  externalUrl?: string;
  idempotencyKey: string;
  reason?: string;
  attempts: number;
  verification?: VerificationResult;
  durationMs?: number;
};

export type RunOutcome = {
  runId: string;
  planId: string;
  accountId: string;
  actions: ExecutedAction[];
  policy: PolicyDecision[];
  startedAt: string;
  finishedAt: string;
};

export type AuditEvent = {
  ts: string;
  runId: string;
  kind:
    | "run_started"
    | "tool_read"
    | "evidence"
    | "plan_proposed"
    | "policy_evaluated"
    | "approval_requested"
    | "approval_granted"
    | "approval_denied"
    | "action_skipped"
    | "action_executed"
    | "action_failed"
    | "verification"
    | "run_metrics"
    | "run_finished";
  accountId?: string;
  detail: Record<string, unknown>;
};
