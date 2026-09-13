/**
 * The agent's toolset.
 *
 * Phase 1 tools are strictly read-only — the model may roam freely because it
 * cannot cause an effect. The single terminal tool, `propose_save_play`, does
 * not execute anything either: it records a proposal that the deterministic
 * runtime then polices, gates, executes and verifies.
 */
import { tool } from "ai";
import { z } from "zod";
import { buildSnapshot, listAccounts, getUsage } from "../store";
import { isConfigured } from "../env";
import type { Plan, ProposedAction } from "../types";

export type ProposalSink = { plan: Plan | null };

export function buildTools(
  sink: ProposalSink,
  onRead?: (name: string, summary: string) => void,
  onEvidence?: (items: import("../types").Evidence[]) => void,
) {
  return {
    list_accounts: tool({
      description:
        "List every account in the book of business with its tags, plan and owner. Cheap — call this first.",
      inputSchema: z.object({}),
      execute: async () => {
        const accounts = listAccounts().map((a) => {
          const usage = getUsage(a.id);
          return {
            accountId: a.id,
            name: a.name,
            owner: a.owner.name,
            contact: `${a.contact.name} (${a.contact.role})`,
            tags: a.tags,
            usageChangePct: usage.changePct,
            lastContactedAt: a.lastContactedAt ?? "never",
          };
        });
        onRead?.("list_accounts", `${accounts.length} accounts`);
        return { accounts };
      },
    }),

    get_account_snapshot: tool({
      description:
        "Fetch the full risk picture for one account: live Stripe billing (MRR, renewal, failed payments), live Linear support tickets, product-usage telemetry, a deterministic risk score, and the evidence list behind it.",
      inputSchema: z.object({
        accountId: z.string().describe("Account id from list_accounts, e.g. acc_acme"),
      }),
      execute: async ({ accountId }) => {
        const s = await buildSnapshot(accountId);
        onEvidence?.(s.evidence);
        onRead?.("get_account_snapshot", `${s.account.name} · risk ${s.riskScore}/100`);
        return {
          account: {
            id: s.account.id,
            name: s.account.name,
            tags: s.account.tags,
            owner: s.account.owner,
            contact: s.account.contact,
            lastContactedAt: s.account.lastContactedAt ?? "never",
          },
          billing: {
            mrr: `$${(s.billing.mrrCents / 100).toLocaleString()}/mo`,
            mrrCents: s.billing.mrrCents,
            status: s.billing.status,
            daysToRenewal: s.billing.daysToRenewal,
            failedPayment: s.billing.failedPaymentCents
              ? `$${(s.billing.failedPaymentCents / 100).toFixed(2)} uncollected`
              : null,
          },
          usage: {
            currentWeeklyActiveSeats: s.usage.current,
            baselineWeeklyActiveSeats: s.usage.baseline,
            changePct: s.usage.changePct,
            trailing8Weeks: s.usage.series,
          },
          tickets: s.tickets.map((t) => ({
            identifier: t.identifier,
            title: t.title,
            state: t.state,
            labels: t.labels,
            ageDays: Math.round((Date.now() - Date.parse(t.createdAt)) / 86_400_000),
          })),
          riskScore: s.riskScore,
          riskReasons: s.riskReasons,
          // Cite these keys inline in your rationale, e.g. "[stripe-2]".
          citations: s.evidence.map((e) => ({ key: e.key, source: e.source, fact: `${e.label}: ${e.detail}` })),
        };
      },
    }),

    propose_save_play: tool({
      description:
        "Propose the recovery play for the single highest-risk account. Call this exactly once, at the end. This does NOT execute anything — a deterministic policy engine reviews your plan, a human may be asked to approve it, and only then does the runtime act and verify.",
      inputSchema: z.object({
        accountId: z.string(),
        headline: z.string().describe("One line an operator can read in two seconds. Include the number that matters."),
        rationale: z
          .string()
          .describe("2-4 sentences citing the specific evidence: amounts, percentages, ticket identifiers, dates."),
        recoveryTask: z
          .object({
            title: z.string(),
            description: z.string().describe("What the CSM should actually do, as concrete steps."),
            priority: z.number().min(0).max(4).optional().describe("Linear priority: 1 urgent, 2 high, 3 normal. Defaults to 2."),
          })
          .optional()
          .describe("A Linear issue for the account owner. Omit if no human follow-up is warranted."),
        customerEmail: z
          .object({
            subject: z.string(),
            body: z.string().describe("Plain text, paragraphs separated by blank lines. 120 words max."),
          })
          .optional()
          .describe("Outreach to the customer contact. Omit if writing to them is not the right move."),
        createSavePlanDoc: z.boolean().describe("Write the evidence-backed save plan to Notion."),
        alertOwner: z.boolean().describe("Post a Slack alert to the account owner."),
      }),
      execute: async (input) => {
        const actions: ProposedAction[] = [];
        // An action whose connector has no credentials is dropped here rather
        // than failing later. The plan reflects what this deployment can
        // actually do, and the operator sees exactly what was omitted.
        const skipped: string[] = [];
        if (input.recoveryTask && isConfigured("linear")) {
          actions.push({
            type: "create_linear_issue",
            summary: `Create Linear task "${input.recoveryTask.title}"`,
            payload: { ...input.recoveryTask },
          });
        }
        if (input.createSavePlanDoc && isConfigured("notion")) {
          actions.push({
            type: "create_notion_page",
            summary: "Write the save plan to Notion",
            payload: { headline: input.headline },
          });
        }
        if (input.customerEmail && isConfigured("resend")) {
          actions.push({
            type: "send_customer_email",
            summary: `Email the customer — "${input.customerEmail.subject}"`,
            payload: { ...input.customerEmail },
          });
        }
        if (input.alertOwner && isConfigured("slack")) {
          actions.push({
            type: "post_slack_alert",
            summary: "Alert the account owner in Slack",
            payload: { headline: input.headline },
          });
        }

        sink.plan = {
          id: `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          accountId: input.accountId,
          createdAt: new Date().toISOString(),
          rationale: input.rationale,
          evidence: [],
          actions,
        };
        if (input.recoveryTask && !isConfigured("linear")) skipped.push("linear");
        if (input.createSavePlanDoc && !isConfigured("notion")) skipped.push("notion");
        if (input.customerEmail && !isConfigured("resend")) skipped.push("resend");
        if (input.alertOwner && !isConfigured("slack")) skipped.push("slack");

        return {
          accepted: true,
          planId: sink.plan.id,
          actionCount: actions.length,
          droppedUnconfigured: skipped,
          note: "Plan recorded. The policy engine will now review it.",
        };
      },
    }),
  };
}
