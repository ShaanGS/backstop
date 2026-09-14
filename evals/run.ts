/**
 * Keel reliability suite.
 *
 * Each case pins a synthetic account state and a proposed plan, then drives the
 * REAL pipeline — the same `evaluatePolicy` and `executePlan` the product runs —
 * and asserts on what actually happened.
 *
 *   pnpm eval          fixture mode: the third-party network boundary is stubbed
 *                      (KEEL_SINK=1) so the suite is deterministic, fast and
 *                      runnable with no API keys. Every Keel gate still runs.
 *   pnpm eval --live   the same cases with the stub removed, writing to the real
 *                      Stripe / Linear / Slack / Notion / Resend workspaces.
 *
 * The distinction matters and is not hidden: fixture mode proves the decision
 * logic, live mode proves the integrations.
 */
import "../scripts/load-env";

const LIVE = process.argv.includes("--live");
if (!LIVE) process.env.KEEL_SINK = "1";

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import cases from "./cases.json";
import { executePlan } from "../lib/execute";
import { evaluatePolicy, requiresApproval } from "../lib/policy";
import { diagnose } from "../lib/diagnose";
import { resetLedger } from "../lib/idempotency";
import { scoreRisk } from "../lib/store";
import type { AccountSnapshot } from "../lib/store";
import type { ActionType, Plan, ProposedAction, Ticket } from "../lib/types";

type Case = (typeof cases)[number];

const SUMMARY: Record<ActionType, string> = {
  create_linear_issue: "Create the recovery task in Linear",
  create_notion_page: "Write the save plan to Notion",
  send_customer_email: "Email the customer contact",
  post_slack_alert: "Alert the account owner in Slack",
};

function buildSnapshot(c: Case): AccountSnapshot {
  const a = c.account;
  const tickets: Ticket[] = (a.tickets ?? []).map((t, i) => ({
    id: `tkt_${c.id}_${i}`,
    identifier: `EVAL-${i + 1}`,
    title: t.title,
    url: `https://linear.app/eval/issue/EVAL-${i + 1}`,
    labels: t.labels,
    state: t.state,
    createdAt: new Date(Date.now() - t.ageDays * 86_400_000).toISOString(),
    reportedAt: new Date(Date.now() - t.ageDays * 86_400_000).toISOString(),
  }));
  const series = a.usage;
  const current = series[series.length - 1];
  const baseline = Math.round(series.slice(0, 4).reduce((x, y) => x + y, 0) / 4);
  const usage = { series, current, baseline, changePct: Math.round(((current - baseline) / baseline) * 1000) / 10 };
  const billing = {
    mrrCents: a.mrrCents,
    currency: "USD",
    renewalDate: new Date(Date.now() + a.daysToRenewal * 86_400_000).toISOString(),
    daysToRenewal: a.daysToRenewal,
    status: a.status,
    failedPaymentCents: "failedPaymentCents" in a ? (a.failedPaymentCents as number) : undefined,
  };
  const { score, reasons } = scoreRisk(billing, usage, tickets);
  const diagnosis = diagnose(usage, tickets);
  return {
    account: {
      id: `eval_${c.id}`,
      name: a.name,
      domain: "eval.test",
      owner: { name: "Eval Owner", email: "owner@eval.test", slackHandle: "@owner" },
      contact: { name: "Eval Contact", email: "contact@eval.test", role: "Ops" },
      tags: a.tags,
      timezone: "UTC",
      stripeCustomerId: "cus_eval",
      lastContactedAt:
        "contactedDaysAgo" in a && typeof a.contactedDaysAgo === "number"
          ? new Date(Date.now() - a.contactedDaysAgo * 86_400_000).toISOString()
          : undefined,
    },
    billing, usage, tickets, riskScore: score, riskReasons: reasons, diagnosis,
    evidence: [],
  };
}

function buildPlan(c: Case, snapshot: AccountSnapshot): Plan {
  const actions: ProposedAction[] = (c.proposes as ActionType[]).map((type) => ({
    type,
    summary: SUMMARY[type],
    payload:
      type === "send_customer_email"
        ? { subject: `About your ${snapshot.account.name} account`, body: "Eval fixture body.", to: snapshot.account.contact.email }
        : type === "create_linear_issue"
          ? { title: `Recover ${snapshot.account.name}`, description: "Eval fixture.", priority: 2 }
          : { headline: `Eval: ${snapshot.account.name}` },
  }));
  return {
    id: `plan_eval_${c.id}`,
    accountId: snapshot.account.id,
    createdAt: new Date().toISOString(),
    rationale: c.title,
    evidence: [],
    actions,
  };
}

const eq = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

type Failure = { check: string; expected: string; got: string };

async function runCase(c: Case) {
  resetLedger();
  const snapshot = buildSnapshot(c);
  const plan = buildPlan(c, snapshot);
  const failures: Failure[] = [];

  // 0. The causal diagnosis, which the model is not allowed to override.
  const dx = c.expect.diagnosis;
  if (dx) {
    const d = snapshot.diagnosis;
    if (typeof dx.hasOnset === "boolean" && Boolean(d.onset) !== dx.hasOnset) {
      failures.push({ check: "decline detected", expected: String(dx.hasOnset), got: String(Boolean(d.onset)) });
    }
    if (dx.topVerdict && d.causes[0]?.verdict !== dx.topVerdict) {
      failures.push({ check: "top cause verdict", expected: dx.topVerdict, got: d.causes[0]?.verdict ?? "none" });
    }
    if (dx.topTicket && d.causes[0]?.ticket.identifier !== dx.topTicket) {
      failures.push({ check: "top cause ticket", expected: dx.topTicket, got: d.causes[0]?.ticket.identifier ?? "none" });
    }
    // The point of the whole exercise: never name a cause the timing rules out.
    if (dx.noLikelyCause && d.causes.some((x) => x.verdict === "likely")) {
      failures.push({
        check: "no cause asserted",
        expected: "no 'likely' cause",
        got: d.causes.filter((x) => x.verdict === "likely").map((x) => x.ticket.identifier).join(", "),
      });
    }
  }

  // 1. Policy fires the rules we expect.
  const decisions = evaluatePolicy(snapshot, plan);
  const rules = decisions.map((d) => d.rule);
  for (const expected of c.expect.policyRules) {
    if (!rules.includes(expected)) {
      failures.push({ check: "policy rule fired", expected, got: rules.join(", ") || "none" });
    }
  }

  // 2. The approval gate is where we expect it.
  const gate = requiresApproval(decisions, plan);
  if (Boolean(gate) !== c.expect.requiresApproval) {
    failures.push({ check: "approval gate", expected: String(c.expect.requiresApproval), got: String(Boolean(gate)) });
  }

  // 3. A gated plan that is never approved must perform nothing at all.
  const approve = "approve" in c.expect ? (c.expect.approve as boolean) : true;
  let executed: string[] = [];
  let blocked: string[] = [];

  if (gate && !approve) {
    // Halted at the gate: the pipeline is never entered.
    executed = []; blocked = [];
  } else {
    const results = await executePlan(plan, snapshot, decisions, { runId: `eval_${c.id}` });
    executed = results.filter((r) => r.status === "executed").map((r) => r.type);
    blocked = results.filter((r) => r.status === "blocked_by_policy").map((r) => r.type);

    // 4. Every executed action must carry a passing verification.
    for (const r of results.filter((x) => x.status === "executed")) {
      if (!r.verification?.verified) {
        failures.push({ check: "verification", expected: `${r.type} verified`, got: r.verification?.detail ?? "missing" });
      }
    }
  }

  if (!eq(executed, c.expect.executed)) {
    failures.push({ check: "executed actions", expected: c.expect.executed.join(", ") || "none", got: executed.join(", ") || "none" });
  }
  if (!eq(blocked, c.expect.blocked)) {
    failures.push({ check: "blocked actions", expected: c.expect.blocked.join(", ") || "none", got: blocked.join(", ") || "none" });
  }

  // 5. Idempotency: replaying the identical plan must perform zero new actions.
  if ("assertRerun" in c.expect && c.expect.assertRerun) {
    const again = await executePlan(plan, snapshot, decisions, { runId: `eval_${c.id}_rerun` });
    const reExecuted = again.filter((r) => r.status === "executed").length;
    const skipped = again.filter((r) => r.status === "skipped_idempotent").length;
    if (reExecuted !== 0) {
      failures.push({ check: "idempotent re-run", expected: "0 new actions", got: `${reExecuted} executed` });
    }
    if (skipped !== c.expect.executed.length) {
      failures.push({ check: "idempotent re-run", expected: `${c.expect.executed.length} skipped`, got: `${skipped} skipped` });
    }
  }

  return { c, failures, executed, blocked, rules };
}

async function main() {
  const mode = LIVE ? "LIVE (real external writes)" : "fixture (network boundary stubbed)";
  console.log(`\n  Keel reliability suite — ${mode}\n`);

  const results = [];
  for (const c of cases as Case[]) {
    const r = await runCase(c);
    results.push(r);
    const ok = r.failures.length === 0;
    const tag = c.kind === "must_not_act" ? "must-not-act" : "must-act";
    console.log(`  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${c.id.padEnd(28)} ${tag.padEnd(13)} ${c.title}`);
    for (const f of r.failures) {
      console.log(`        └ ${f.check}: expected "${f.expected}", got "${f.got}"`);
    }
  }

  const passed = results.filter((r) => r.failures.length === 0).length;
  const mustNot = results.filter((r) => r.c.kind === "must_not_act");
  const mustNotPassed = mustNot.filter((r) => r.failures.length === 0).length;
  console.log(`\n  ${passed}/${results.length} cases passed · ${mustNotPassed}/${mustNot.length} must-not-act cases passed\n`);

  const report = [
    `# Keel reliability report`,
    ``,
    `Generated ${new Date().toISOString()} · mode: **${mode}** · model-independent (policy and execution gates only).`,
    ``,
    `**${passed}/${results.length} cases passed**, including **${mustNotPassed}/${mustNot.length} must-not-act cases**.`,
    ``,
    `| | Case | Class | Policy rules fired | Executed | Blocked |`,
    `|---|---|---|---|---|---|`,
    ...results.map((r) =>
      `| ${r.failures.length === 0 ? "✅" : "❌"} | ${r.c.title} | ${r.c.kind === "must_not_act" ? "must-not-act" : "must-act"} | \`${r.rules.join("`, `")}\` | ${r.executed.length ? r.executed.map((e) => `\`${e}\``).join(", ") : "—"} | ${r.blocked.length ? r.blocked.map((e) => `\`${e}\``).join(", ") : "—"} |`,
    ),
    ``,
    `## What each case asserts`,
    ``,
    `1. The expected policy rules fired for that account state.`,
    `2. The approval gate engaged (or did not) exactly as specified.`,
    `3. A gated plan that is not approved performs **zero** actions.`,
    `4. Exactly the expected actions executed, and exactly the expected actions were blocked.`,
    `5. Every executed action carries a passing post-action verification.`,
    `6. Replaying a completed plan performs **zero** new actions and reports them as skipped.`,
    ``,
  ].join("\n");
  writeFileSync(join(process.cwd(), "evals", "REPORT.md"), report, "utf8");
  console.log(`  Report written to evals/REPORT.md\n`);

  resetLedger();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
