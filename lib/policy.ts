/**
 * Deterministic policy engine.
 *
 * The model proposes; this module disposes. Nothing the LLM emits can bypass
 * these rules, because they run on the proposed plan *after* generation and
 * before any external write. Every rule is a pure function of the account and
 * its signals, which is what makes the eval suite meaningful.
 */
import type { AccountSnapshot } from "./store";
import type { ActionType, PolicyDecision, Plan } from "./types";

/** Actions that are visible to the customer. Everything else is internal. */
export const CUSTOMER_FACING: ActionType[] = ["send_customer_email"];
const ALL_ACTIONS: ActionType[] = [
  "create_linear_issue",
  "create_notion_page",
  "send_customer_email",
  "post_slack_alert",
];

/** Accounts above this monthly recurring revenue never act without a human. */
export const ENTERPRISE_MRR_CENTS = 500_000;
/** Minimum days between outbound touches to the same account. */
export const CONTACT_COOLDOWN_DAYS = 7;

export function evaluatePolicy(snapshot: AccountSnapshot, plan: Plan): PolicyDecision[] {
  const decisions: PolicyDecision[] = [];
  const { account, billing, tickets } = snapshot;

  // 1. DO_NOT_CONTACT — hard stop on everything. Legal/CS owns this flag.
  if (account.tags.includes("do-not-contact")) {
    decisions.push({
      rule: "DO_NOT_CONTACT",
      outcome: "block",
      reason: `${account.name} is tagged do-not-contact. No outbound or internal action may be taken on this account.`,
      appliesTo: ALL_ACTIONS,
      evidence: `account.tags = [${account.tags.join(", ")}]`,
    });
    return decisions; // nothing else matters
  }

  // 2. OPEN_ESCALATION — a live escalation means a human owns the relationship.
  const escalation = tickets.find(
    (t) => t.labels.some((l) => l.toLowerCase() === "escalation") && t.state !== "Done",
  );
  if (escalation) {
    decisions.push({
      rule: "OPEN_ESCALATION",
      outcome: "block",
      reason: `Open escalation ${escalation.identifier} ("${escalation.title}"). Customer outreach is suppressed; route to the account owner instead.`,
      appliesTo: CUSTOMER_FACING,
      evidence: escalation.url,
    });
  }

  // 3. CONTACT_FREQUENCY — never two outbound touches inside the cooldown.
  if (account.lastContactedAt) {
    const days = (Date.now() - Date.parse(account.lastContactedAt)) / 86_400_000;
    if (days < CONTACT_COOLDOWN_DAYS) {
      decisions.push({
        rule: "CONTACT_FREQUENCY",
        outcome: "block",
        reason: `Last outbound contact was ${days.toFixed(1)} days ago, inside the ${CONTACT_COOLDOWN_DAYS}-day cooldown.`,
        appliesTo: CUSTOMER_FACING,
        evidence: `lastContactedAt = ${account.lastContactedAt}`,
      });
    }
  }

  // 4. ENTERPRISE_APPROVAL — large accounts never move without a human.
  if (billing.mrrCents > ENTERPRISE_MRR_CENTS) {
    decisions.push({
      rule: "ENTERPRISE_APPROVAL",
      outcome: "require_approval",
      reason: `${account.name} is $${(billing.mrrCents / 100).toLocaleString()}/mo MRR, above the $${(ENTERPRISE_MRR_CENTS / 100).toLocaleString()} enterprise threshold. Every action requires human approval.`,
      appliesTo: ALL_ACTIONS,
      evidence: `mrr = ${billing.mrrCents}`,
    });
  }

  // 5. CUSTOMER_CONTACT_APPROVAL — the default posture: a human signs off on
  //    anything the customer will see, regardless of account size.
  const hasCustomerFacing = plan.actions.some((a) => CUSTOMER_FACING.includes(a.type));
  if (hasCustomerFacing) {
    decisions.push({
      rule: "CUSTOMER_CONTACT_APPROVAL",
      outcome: "require_approval",
      reason: "Plan contains customer-visible outreach. A human must approve before it is sent.",
      appliesTo: CUSTOMER_FACING,
    });
  }

  if (!decisions.length) {
    decisions.push({
      rule: "DEFAULT_ALLOW",
      outcome: "allow",
      reason: "No policy rule restricts this plan. Internal actions may proceed automatically.",
      appliesTo: ALL_ACTIONS,
    });
  }
  return decisions;
}

/** Is this specific action type blocked by any decision? */
export function isBlocked(decisions: PolicyDecision[], type: ActionType): PolicyDecision | undefined {
  return decisions.find((d) => d.outcome === "block" && d.appliesTo.includes(type));
}

/**
 * A plan is held at the approval gate if any *surviving* (non-blocked) action
 * requires approval. Approval is plan-level on purpose: we never partially
 * execute a save play.
 */
export function requiresApproval(decisions: PolicyDecision[], plan: Plan): PolicyDecision | undefined {
  return decisions.find(
    (d) =>
      d.outcome === "require_approval" &&
      plan.actions.some((a) => d.appliesTo.includes(a.type) && !isBlocked(decisions, a.type)),
  );
}

/** Actions that survive policy — what would actually run on approval. */
export function survivingActions(decisions: PolicyDecision[], plan: Plan) {
  return plan.actions.filter((a) => !isBlocked(decisions, a.type));
}
