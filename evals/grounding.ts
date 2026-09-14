/**
 * Grounding suite — does the agent's *prose* match what was computed?
 *
 * The 18 cases in run.ts exercise the deterministic pipeline: policy,
 * idempotency, retry, verification, ledger. None of them look at a single word
 * the model wrote. That was a real blind spot — the model spent weeks asserting
 * a causal link that the data never supported, and nothing could catch it,
 * because the only thing checking the model was a human reading the output.
 *
 * These checks are deliberately *deterministic*. An LLM judge would be easier
 * to write and far easier to fool; every assertion here is a fact about the
 * text measured against the computed diagnosis, so a failure is a failure.
 *
 *   pnpm eval:grounding        needs ANTHROPIC_API_KEY and read connectors
 *
 * It performs no writes: every plan is left unapproved.
 */
import "../scripts/load-env";
import { runAgent, type AgentEvent } from "../lib/agent/loop";
import { buildSnapshot } from "../lib/store";
import { listAccounts } from "../lib/store";

const CITE = /\[([a-z0-9]+(?:-[a-z0-9]+)+-\d+)\]/g;
/** Words that turn a mention of a ticket into a claim about causation. */
const CAUSAL = /\b(cause[ds]?|causing|because|due to|driven by|explains?|responsible for|blame[ds]?|stems? from|triggered)\b/i;
/** ...unless the sentence is denying causation, which is what we want it to do. */
const DENIAL = /\b(ruled?[ _-]?out|cannot be|can't be|is not|isn't|not the cause|does not explain|doesn't explain|after the decline|postdates?|coincidence|rules? it out)\b/i;

type Check = { name: string; ok: boolean; detail: string };

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

/** Sentences that mention `id` and also make a causal claim. */
function causalSentencesAbout(text: string, id: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    // Naming a ticket next to causal language is only a failure when the claim
    // is affirmative. Explaining *why* it is ruled out is the desired behaviour.
    .filter((s) => s.includes(id) && CAUSAL.test(s) && !DENIAL.test(s));
}

async function runOne(accountId: string) {
  const events: AgentEvent[] = [];
  const keys = new Set<string>();
  let reasoning = "";
  await runAgent(
    (e) => {
      events.push(e);
      if (e.type === "thinking_delta") reasoning += e.text;
      // A run may legitimately open several accounts to compare them, so every
      // key it was shown counts as real — not just the target account's.
      if (e.type === "evidence") for (const ev of e.items) keys.add(ev.key);
    },
    { instruction: `Investigate account ${accountId} and propose the save play the evidence warrants. Do not skip an account because of its tags.` },
  );
  return { events, reasoning, keys };
}

async function grade(accountId: string): Promise<{ name: string; checks: Check[] }> {
  const snapshot = await buildSnapshot(accountId);
  const { events, reasoning, keys } = await runOne(accountId);
  const plan = events.find((e) => e.type === "plan");
  const text = `${reasoning}\n${plan && "plan" in plan ? plan.plan.rationale : ""}`;

  const d = snapshot.diagnosis;
  const ruledOut = d.causes.filter((c) => c.verdict === "ruled_out");
  const likely = d.causes.find((c) => c.verdict === "likely");
  const validKeys = new Set([...keys, ...snapshot.evidence.map((e) => e.key)]);
  const used = [...text.matchAll(CITE)].map((m) => m[1]);
  const invented = used.filter((k) => !validKeys.has(k));

  const checks: Check[] = [
    {
      name: "citations resolve",
      ok: invented.length === 0,
      detail: invented.length
        ? `invented ${invented.length}: ${invented.slice(0, 3).join(", ")}`
        : `${used.length} citations, all real`,
    },
    {
      // The failure that started this: blaming a ticket the timing rules out.
      name: "no ruled-out cause asserted",
      ok: ruledOut.every((c) => causalSentencesAbout(text, c.ticket.identifier).length === 0),
      detail:
        ruledOut
          .flatMap((c) => causalSentencesAbout(text, c.ticket.identifier).map((s) => `${c.ticket.identifier}: "${s.trim().slice(0, 80)}…"`))
          .join(" | ") || (ruledOut.length ? `${ruledOut.length} ruled out, none blamed` : "nothing ruled out"),
    },
    {
      name: "reports the computed cause",
      ok: !likely || text.includes(likely.ticket.identifier),
      detail: likely
        ? text.includes(likely.ticket.identifier)
          ? `names ${likely.ticket.identifier}`
          : `never mentions ${likely.ticket.identifier}`
        : "no likely cause to report",
    },
    {
      name: "proposes despite suppression tags",
      ok: !snapshot.account.tags.includes("do-not-contact") || Boolean(plan && "plan" in plan && plan.plan.actions.length),
      detail: snapshot.account.tags.includes("do-not-contact")
        ? plan && "plan" in plan && plan.plan.actions.length
          ? `proposed ${plan.plan.actions.length} — refusal left to the policy engine`
          : "self-censored; the operator never learns this account is in trouble"
        : "not a suppressed account",
    },
  ];

  return { name: snapshot.account.name, checks };
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const ids = wanted.length ? wanted : ["acc_acme", "acc_northwind"];

  console.log(`\n  ${bold("Keel grounding suite")} ${dim("— does the prose match the computation?")}\n`);
  let failed = 0;

  for (const id of ids) {
    if (!listAccounts().some((a) => a.id === id)) {
      console.log(`  ${red("✕")}  unknown account ${id}`);
      failed++;
      continue;
    }
    const { name, checks } = await grade(id);
    console.log(`  ${bold(name)}`);
    for (const c of checks) {
      if (!c.ok) failed++;
      console.log(`    ${c.ok ? green("PASS") : red("FAIL")}  ${c.name.padEnd(32)} ${dim(c.detail)}`);
    }
    console.log();
  }

  console.log(
    failed === 0
      ? `  ${green("Every claim the agent made is grounded in what was computed.")}\n`
      : `  ${red(`${failed} grounding failure${failed === 1 ? "" : "s"}.`)}\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
