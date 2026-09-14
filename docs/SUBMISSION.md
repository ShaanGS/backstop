# Hyperbloom September — submission copy

Everything Devpost asks for, ready to paste. Kept in the repo so the submitted
text and the shipped code can never drift apart.

- **Repo** — https://github.com/ShaanGS/keel
- **Live app** — https://keel-nine-flame.vercel.app
- **Demo video (2 min)** — https://drive.google.com/file/d/1GM7cbdqAG-AqoLbLXqLp79fPPZdnH1D5/view?usp=sharing

---

## Project description

> Devpost asks for 200-500 words. This is ~440.

**Keel — an agent that finds out *why* a customer is leaving, and acts on it.**

Every churn tool on the market tells you an account is at risk. None of them tell you what went
wrong, because the symptom and the cause are never in the same tool: the usage curve lives in
product analytics, the cause lives in a support ticket somebody filed six weeks ago. Connecting
them is roughly forty minutes of cross-app work per account — which is exactly why it doesn't
happen until the quarter is already lost.

Keel does that work end to end. It investigates an account across five real apps — Stripe,
Linear, Slack, Notion and Resend — diagnoses the cause, runs the recovery play, and proves every
action by re-reading it from the app that performed it.

**Finding the cause is computed, not guessed.** Keel locates the onset of the sustained usage
decline, then scores every open ticket on temporal alignment (a cause must precede its effect)
and on severity. A ticket filed after the decline began is ruled out, and Keel reports that
rather than dropping it silently. The newest, most escalated ticket is the one a human skimming
the queue reaches for first, and the one a language model asked to "find the cause" will invent
a story about. That was a real bug here: for most of this project's life the agent blamed the
wrong ticket on every run, fluently and with citations, and no test caught it.

**Two phases.** Phase 1 is genuinely agentic — the model is handed read-only tools and chooses
its own path: which accounts to open, how deep to dig, when it has seen enough. Nothing in the
code sequences those calls. Phase 2 never consults the model at all: policy → approval gate →
idempotency → execute with retry → verify by read-back → append-only ledger. A model can be
wrong about judgment and recover; it cannot be allowed to be wrong about whether an email has
already been sent.

**Two evaluation layers.** `pnpm eval` runs 18 deterministic cases in CI with zero credentials —
five of them assert Keel does *nothing*: legal hold, contact cooldown, enterprise threshold, open
escalation, and replay of completed work. `pnpm eval:grounding` runs the live agent and measures
its prose against the computation: every citation must resolve to a real record, and no
ruled-out cause may be blamed. Both are deterministic on purpose — an LLM judge is easier to
write and far easier to fool.

Every run also records its own token use and per-phase latency, which immediately surfaced two
bugs invisible to code review: a `temperature` setting the SDK was silently discarding, and a
completely cold prompt cache (0% → 33-52% of input tokens).

---

## AI tools disclosure

**Claude Opus 5 (Anthropic API) — the product itself.**
The agent's investigation phase is a `streamText` tool-calling loop against `claude-opus-5` via
the Vercel AI SDK. The model chooses which accounts to open and which signals to chase, reads
unstructured support-ticket prose, synthesises Stripe billing, Linear issues and usage telemetry
into one account narrative, and writes the customer email, save-plan document and owner alert.
It is not an added feature — remove it and there is no product, because no rule set reads a
support queue and explains a usage cliff.

**Claude Code — development.**
Used throughout as a pair programmer: scaffolding the Next.js app, writing connectors and the
eval harness, refactoring, and reviewing. Notably it was used to *audit* the project's own
correctness — the hallucinated-causation bug described above was found by writing an eval layer
that reads the model's output, not by reading the code.

**No custom model training.** No fine-tuning, no embeddings, no retrieval corpus. The
intelligence is entirely in the agent loop, its tool design and its system prompt; the
reliability is entirely in deterministic code that runs after it.

**Generative image tools** were used for the project logo and README banner artwork.

---

## Team

Solo project — Shaan Gurushankar.

---

## How to verify the claims in 30 seconds

```bash
git clone https://github.com/ShaanGS/keel && cd keel
pnpm install && pnpm eval
```

```
18/18 cases passed · 5/5 must-not-act cases passed
```

No API keys required. Fixture mode stubs only the third-party network boundary — every Keel
gate (policy, idempotency, retry, read-back verification, ledger) executes for real, which is
why this same command runs in CI on every push with no credentials configured.

---

## Elevator pitch (200 char limit — this is 196)

Every churn tool tells you an account is at risk. None tell you why. Keel investigates across Stripe, Linear, Slack, Notion and Resend, finds the cause, acts on it, and proves every action landed.

---

## Built with (Devpost tags)

typescript · react · next.js · tailwindcss · anthropic-claude · vercel-ai-sdk · zod ·
stripe · linear · slack · notion · resend · vercel · github-actions · node.js

---

## Try it out links

- https://keel-nine-flame.vercel.app — live app
- https://github.com/ShaanGS/keel — source

---

## Video demo link

https://drive.google.com/file/d/1GM7cbdqAG-AqoLbLXqLp79fPPZdnH1D5/view?usp=sharing

---

## Image gallery — drag these in from the repo

1. `docs/landing.png` — product page. Lead image.
2. `docs/console.png` — the operator console.
3. `docs/banner.png` — repo banner.

---

## Project story

The full "About the project" markdown is in [DEVPOST-STORY.md](DEVPOST-STORY.md),
following Devpost's four prompts: inspiration, how I built it, challenges, what I learned.
