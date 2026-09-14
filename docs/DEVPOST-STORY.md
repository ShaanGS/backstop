## What it does

Keel is an autonomous revenue-retention agent. It investigates an account across five
real apps, works out **why** it is declining, runs the recovery play, and proves every
action by re-reading it from the app that performed it.

| App | Direction | Its job |
|---|---|---|
| **Stripe** | read | Billing truth — MRR, renewal date, failed payments |
| **Linear** | read + write | Reads the support queue to find the cause; writes the recovery task |
| **Slack** | write | Alerts the account owner, including when Keel *refuses* to act |
| **Notion** | write | The case record, for whoever inherits the account |
| **Resend** | write | The customer email — the only outbound, irreversible touch |

## Inspiration

Every churn dashboard tells you an account is at risk. Not one tells you what went
wrong, and that is the only part anybody actually needs, because the symptom and the
cause are never in the same tool. The usage curve lives in product analytics. The cause
is a support ticket somebody filed six weeks ago. Joining them by hand is about forty
minutes per account, which is exactly why it does not happen until the quarter is
already lost.

That gap is what makes this a multi-app problem rather than a dashboard feature.

## How I built it

**Two phases, and the split is the whole design.**

**Phase 1 is genuinely agentic.** A `streamText` tool-calling loop against
`claude-opus-5` gets read-only tools and chooses its own path — which accounts to open,
which signals to chase, how deep to dig, when it has seen enough. Nothing in the code
sequences those calls or branches on an account id.

**Phase 2 never consults the model at all:**

```
propose → policy → approval gate → idempotency → execute (1 retry) → verify by read-back → ledger
```

A model can be wrong about judgment and recover. It cannot be allowed to be wrong about
whether an email has already been sent.

**The cause is computed, not guessed.** `lib/diagnose.ts` finds the onset of the
sustained usage decline, then scores every open ticket on temporal alignment — a cause
must *precede* its effect — and on severity. A ticket filed *after* the decline began is
ruled out, and Keel says so rather than dropping it silently.

## Challenges I ran into

**The agent hallucinated causation for most of this project's life.** It blamed the
wrong ticket on every single run — fluently, with citations, and completely wrong. The
ticket it kept naming was the newest and most escalated on the account, which is exactly
what a human skimming the queue reaches for and exactly what a language model invents a
story about. It postdated the decline by a month.

No test caught it, because all 18 of my tests exercised the deterministic half and not
one of them read a word the model produced.

So I built a second eval layer. `pnpm eval:grounding` runs the live agent and measures
its prose against what was computed: every citation must resolve to a real record, and no
ruled-out cause may be blamed. Deterministic on purpose — an LLM judge is easier to write
and far easier to fool.

Writing that test then found two bugs **in the test itself**, which is the part I am
most glad about. It flagged the agent for correctly *explaining* a ruling-out, and it
flagged legitimate cross-account citations. A test that fails on correct behaviour is
worse than no test.

## What I learned

**Instrument before you optimise.** I added per-run token and per-phase latency
recording, and it immediately surfaced two things reading the code never would: a
`temperature` setting the SDK was silently discarding, and a completely cold prompt cache
— 26,782 input tokens, 0 cached, on a run whose tool schemas are identical at every step.
One cache breakpoint took cached input to 33–52%.

**Refusal is a feature, and it has to be visible.** Two of the three verdicts
`diagnose()` can return are the system declining to name a cause: *no ticket explains the
timing*, and *silent — nobody filed a ticket*. Five of the eighteen eval cases assert
that Keel does **nothing**.

## Verify it yourself in 30 seconds

```bash
git clone https://github.com/ShaanGS/keel && cd keel
pnpm install && pnpm eval
```

```
18/18 cases passed · 5/5 must-not-act cases passed
```

**No API keys required.** Fixture mode stubs only the third-party network boundary —
policy, idempotency, retry, read-back verification and the ledger all execute for real,
which is why this same command runs in CI on every push with no credentials configured.
