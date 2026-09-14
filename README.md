<div align="center">

<img src="docs/banner.png" alt="Keel — an agent trusted to take irreversible business actions" width="100%">

<br>

**Your churn dashboard tells you a customer is at risk. It never tells you *why* — because the symptom and the cause are never in the same tool. Keel finds the why across five apps, acts on it, and proves every action by reading the app back.**

[![reliability suite](https://github.com/ShaanGS/keel/actions/workflows/ci.yml/badge.svg)](https://github.com/ShaanGS/keel/actions/workflows/ci.yml)
[![14/14 cases](https://img.shields.io/badge/reliability-18%2F18_cases-14804a?labelColor=1c1c1f)](evals/REPORT.md)
[![5 of them assert nothing happens](https://img.shields.io/badge/5-assert_it_does_nothing-c6303b?labelColor=1c1c1f)](evals/REPORT.md)
[![5 external apps](https://img.shields.io/badge/external_apps-5-5a50e0?labelColor=1c1c1f)](#external-apps)
[![license](https://img.shields.io/badge/license-MIT-9a9ea6?labelColor=1c1c1f)](LICENSE)
[![live](https://img.shields.io/badge/live-keel--nine--flame.vercel.app-16171a?labelColor=1c1c1f)](https://keel-nine-flame.vercel.app)

**[Live app](https://keel-nine-flame.vercel.app)**  ·  **[▶ Demo video (2 min)](https://drive.google.com/file/d/1GM7cbdqAG-AqoLbLXqLp79fPPZdnH1D5/view?usp=sharing)**  ·  [Reliability report](evals/REPORT.md)  ·  [Architecture](#architecture)  ·  [How it was verified](#how-i-tested-and-verified-it-works)  ·  [video mirror](docs/demo.mp4)

</div>

---

## Check the claim yourself — 30 seconds, no API keys

```bash
git clone https://github.com/ShaanGS/keel && cd keel
pnpm install && pnpm eval
```

```
18/18 cases passed · 5/5 must-not-act cases passed
```

Fixture mode stubs **only** the third-party network boundary. Every Keel gate — policy,
idempotency, retry, read-back verification, ledger — executes for real, which is why this runs
in CI on every push with no credentials configured.

Five of those eighteen assert that Keel does **nothing**: on a legal hold, inside a contact
cooldown, above an enterprise approval threshold, against an open escalation, and on a replay
of work already done. [Full scorecard →](evals/REPORT.md)

### And a second layer, for the half a pipeline test can't reach

Those eighteen cases never read a word the model wrote — which is exactly where Keel's worst
bug lived. `pnpm eval:grounding` runs the real agent and measures its prose against what was
computed:

| Check | Why it exists |
|---|---|
| Every citation key resolves | A key the model invents renders as a dead link and everything around it becomes unverifiable |
| No ruled-out ticket is named as a cause | The failure that started this. Blaming a defect reported *after* the decline sends someone to fix the wrong thing |
| A computed likely cause is actually reported | Finding the cause is worthless if the write-up omits it |
| A suppressed account still gets a plan | If the model quietly skips a `do-not-contact` account, refusal stops being the policy engine's decision and nobody learns the account is in trouble |

Deterministic on purpose. An LLM judge would be easier to write and much easier to fool; every
assertion here is a measurable fact about the text. It needs `ANTHROPIC_API_KEY` and the read
connectors, and it performs no writes — every plan is left unapproved.

## The problem

Churn is rarely a surprise. It is a failed payment nobody chased, two support tickets that went
quiet, and a usage graph that bent downward six weeks before the renewal date — each signal
sitting in a different tool, none of them adding up in anybody's head until the cancellation
email arrives.

The work of catching it is unglamorous and entirely mechanical: read the billing system, read
the support queue, read the usage data, decide whether this account is actually in trouble, then
open the task, write the plan, send the email, book the follow-up, and tell the account owner.
It is roughly forty minutes of cross-app grind per account, which is exactly why it does not
happen until the quarter is already lost.

**Keel does that work.** Not a dashboard that tells you an account is at risk — an agent that
investigates the account across five apps and then actually runs the recovery play.

## Why this is hard, and what most agents get wrong

Anyone can wire an LLM to the Slack API. The reason agents like this do not run in production is
that the moment an agent can send email to customers, create tickets, and write documents, the
interesting question stops being "can it do the work" and becomes:

- What stops it emailing an account that legal has flagged **do-not-contact**?
- What stops it emailing a customer who is mid-escalation, where a cheerful check-in makes things worse?
- What stops a retry, a page refresh, or a re-run from sending the same customer a second email?
- When it says it created the task — did it? Or did the API return 500 and the model narrate success?

Keel's answer is an architecture, not a prompt.

## External apps

**All five are credentialed and reachable** — `pnpm preflight` proves it with one read-only
call each. Keel still detects which connectors are configured and drops unavailable actions
from the plan rather than failing on them, so a fresh clone with only Stripe and Linear
degrades cleanly instead of crashing.

Every write is verified by a read-back against the app's own API.

The test each connector has to pass: **a different audience, on a different clock.** An app
that only duplicates another app's reader is padding.

| App | Direction | Who reads it, and when | Verified by |
|---|---|---|---|
| **Stripe** (test mode) | read | Keel itself — the billing truth an opinion can't override | — |
| **Linear** | read + write | The team, over days. Reading it answers *is this churn actually a bug we already know about?*; writing puts the recovery task in the queue they already plan from | `linear.issue(id)` re-fetch + title match |
| **Resend** | write | The customer, now. The only outbound touch, and the only irreversible one | `emails.get(id)`, asserts delivery status |
| **Slack** | write | The account owner, this hour. The policy engine's two human-shaped verdicts — `require_approval` and `block` — otherwise exist only in a browser tab. An approval nobody sees is a stalled account; a blocked account nobody hears about dies quietly under a compliance tag | `chat.getPermalink(ts)` re-resolve |
| **Notion** | write | Whoever inherits the account, months later. The audit log is JSONL for machines; this is the same case written for the next human, linked from the Linear ticket so context travels with the work | `pages.retrieve(id)`, asserts not archived |

Product-usage telemetry (weekly active seats) is Keel's own first-party data in
[`data/accounts.json`](data/accounts.json) — as it would be for any real vendor. Billing and
support signals are **not** read from there: they are fetched live from Stripe and Linear on every
run. `pnpm seed` writes the demo tenancy *into* those apps; the agent then reads it *back out* over
the real APIs.

## Architecture

> The model proposes. The runtime disposes.

```mermaid
flowchart TB
    A["<b>claude-opus-5</b><br/>streamText tool loop"]
    A --> B["list_accounts"]
    A --> C["get_account_snapshot"]
    C --> D(["Stripe<br/>billing · renewal · failed payments"])
    C --> E(["Linear<br/>tickets · escalations"])
    C --> F(["Usage telemetry<br/>first-party"])
    A --> G["<b>propose_save_play</b><br/>the only terminal tool"]

    G ==>|"a Plan — not an action"| H

    H["<b>Policy engine</b><br/>5 deterministic rules"] --> I{"Needs a<br/>human?"}
    I -->|yes| J["Approval gate<br/>plan-level"]
    I -->|no| K["<b>Idempotency ledger</b><br/>sha256 action key"]
    J -->|approved| K
    J -->|rejected| X["Nothing runs"]
    K -->|"key unseen"| L["Execute<br/>1 retry"]
    K -->|"key seen"| M["Skip<br/>no duplicate"]
    L --> N["<b>Verify</b><br/>re-read by id"]
    N --> O(["Linear · Notion · Resend · Slack"])
    N --> P[["Append-only audit log"]]

    subgraph PH1 [" PHASE 1 — investigation · model-driven · read-only "]
        A
        B
        C
        D
        E
        F
        G
    end

    subgraph PH2 [" PHASE 2 — execution · deterministic · the model is never consulted again "]
        H
        I
        J
        K
        L
        M
        N
        X
        P
    end

    classDef model fill:#eeecfd,stroke:#5a50e0,stroke-width:1.5px,color:#16171a
    classDef gate fill:#fdf1e0,stroke:#b45309,stroke-width:1.5px,color:#16171a
    classDef safe fill:#e3f5ec,stroke:#14804a,stroke-width:1.5px,color:#16171a
    classDef stop fill:#fce9ea,stroke:#c6303b,stroke-width:1.5px,color:#16171a
    classDef app fill:#f3f3f1,stroke:#d6d3cd,color:#16171a

    class A,G model
    class I,J gate
    class K,N,M safe
    class X stop
    class D,E,F,O,P app
```


**Phase 1 is genuinely agentic.** The model is handed read-only tools and left alone. It decides
which accounts to open, how deep to dig, when it has enough evidence, and what the play should be.
Trajectories differ by account: a failed payment sends it down the billing path, an open
escalation makes it stop and route to a human instead. Same code, different behaviour — that is
the difference between an agent and a script with an LLM bolted on.

**Phase 2 never asks the model anything.** Policy, approval, idempotency, execution, verification
and the ledger are all deterministic code in [`lib/execute.ts`](lib/execute.ts) and
[`lib/policy.ts`](lib/policy.ts). An LLM can be wrong about judgment; it can never talk its way
past a rule, duplicate an email, or report an action as done that did not land.

The system prompt says this to the model explicitly:

> *A deterministic policy engine runs after you, on the plan you produce. Propose what the evidence
> actually warrants. Do not omit a needed action because you suspect it might be blocked — that is
> the runtime's decision, not yours, and silently self-censoring hides real risk from the operator.*

This is deliberate. Safety that depends on the model behaving is not safety. In the demo you can
watch the agent propose a perfectly sensible outreach to Northwind Trading and watch the policy
engine refuse it — defence in depth you can see working.

### The five reliability primitives

| Primitive | File | What it guarantees |
|---|---|---|
| **Policy engine** | [`lib/policy.ts`](lib/policy.ts) | Six deterministic, pure-function rules decide `allow` / `block` / `require_approval` per action type, with a reason and its evidence. |
| **Idempotency ledger** | [`lib/idempotency.ts`](lib/idempotency.ts) | `sha256(accountId + actionType + planId)` is looked up before every write. Replaying a plan performs **zero** new actions and reports the original resource. |
| **Read-back verification** | [`lib/verify` in each connector](lib/connectors) | After every write the resource is re-fetched **from that app's own API** by id. An action is only "done" when the external system confirms it. |
| **Audit log** | [`lib/audit.ts`](lib/audit.ts) | Append-only JSONL of every read, decision, policy evaluation, action and verification. The UI timeline renders from it; the eval suite asserts against it. |
| **The ledger** | [`lib/ledger.ts`](lib/ledger.ts) | The audit trail, read back as a durable record of everything Keel has ever done — including what it refused and what it suppressed as a duplicate. Survives a refresh, a restart, and the operator who ran it. |

Fixture runs write to `.keel/audit.fixture.jsonl`, not the live trail. The eval suite executes
this same pipeline with the third-party network boundary stubbed, and those actions never
happened to a real customer — letting them share the live file would make the ledger claim
work it never did.

### What a run costs, measured

Every run records its own token use and, separately, the wall-clock of each phase
([`lib/telemetry.ts`](lib/telemetry.ts)). The two phases are never summed into one
number, because the gap between them is the architecture claim stated as a measurement:

| | Phase 1 — investigate | Phase 2 — execute |
|---|---|---|
| What runs | the model, choosing what to read | policy, idempotency, execution, read-back |
| Typical | **~50-65s**, 4-5 model steps, 5-7 tool calls | **~4-5s** |
| Model calls | all of them | **zero** |

Phase 2 is an order of magnitude faster than phase 1 for a reason that is not an
optimisation: it never waits on a model. If that number ever drifts toward phase 1's,
something has started asking the model questions during execution.

Instrumenting this immediately found two things that had been invisible:

- **`temperature: 0.2` was doing nothing.** The model does not accept the parameter and
  the SDK was silently dropping it. A setting that reads like a determinism guarantee and
  isn't one is worse than no setting; it's gone.
- **The prompt cache was completely cold** — 26,782 input tokens, 0 cached, on a run whose
  tool schemas and system prompt are byte-identical at every step. One cache breakpoint on
  the system message took cached input from **0% to 33-52%**.

Neither was findable by reading the code. That is the argument for measuring.

**On cost:** no dollar figure is printed unless you supply the rates
(`KEEL_PRICE_INPUT_PER_MTOK` / `KEEL_PRICE_OUTPUT_PER_MTOK`). A price table baked into a
repo is stale the week after it's written, and an unsourced number on a dashboard is worse
than an absent one. Tokens and latency are measured facts and are always shown.

### The policy rules

| Rule | Trigger | Effect |
|---|---|---|
| `DO_NOT_CONTACT` | account tagged `do-not-contact` | Blocks everything the customer would see. Hard stop on outbound. |
| `INTERNAL_AWARENESS` | fires alongside `DO_NOT_CONTACT` | Explicitly **permits** the internal task and owner alert. Suppressing outbound must not also suppress the fact that the account is in trouble. |
| `OPEN_ESCALATION` | an open Linear issue labelled `escalation` | Blocks customer-facing outreach; internal alert still allowed so a human picks it up. |
| `CONTACT_FREQUENCY` | last outbound touch inside 7 days | Suppresses further outreach. |
| `ENTERPRISE_APPROVAL` | MRR > $5,000/mo | **Every** action requires human approval. Never automatic. |
| `CUSTOMER_CONTACT_APPROVAL` | plan contains customer-visible outreach | A human signs off before anything the customer sees. Default posture, any account size. |

Approval is **plan-level on purpose**: a save play is approved or it is not. Keel never
half-executes a recovery sequence.

### Replay vs. re-investigate — a distinction worth being precise about

Idempotency here means **replay safety**, not "never act on this account twice". The two are
different and Keel treats them differently:

- **Replaying a plan** — same plan id, so the same action keys — performs **zero** writes. A
  retry, a double-click, a page refresh, or a crashed process resuming cannot produce a second
  email. The console has a *Replay this exact plan* button so you can see this rather than take
  it on trust; the eval suite asserts it.
- **Running a fresh investigation** mints a new plan and *is* allowed to act, because the
  account's state may genuinely have moved on. What stops that becoming spam is not the
  idempotency ledger but the `CONTACT_FREQUENCY` policy rule, which suppresses outreach inside a
  seven-day cooldown.

Conflating the two would give a comfortable demo and the wrong system.

## What it looks like

| | |
|---|---|
| ![The Keel console](docs/console.png) | |
| **The console.** Five connected apps down the left with what each one is for, the book of business ranked by risk, and the agent's answer in the middle. Every figure the agent states carries a citation back to the record it came from. | |
| ![The landing page](docs/landing.png) | |
| **The product page.** Served by the same app, from the same design tokens — [keel-nine-flame.vercel.app](https://keel-nine-flame.vercel.app). | |

## Setup

Requires Node 20+ and pnpm. Total setup is about ten minutes, most of it creating free accounts.

```bash
git clone https://github.com/ShaanGS/keel.git
cd keel
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it | Time |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | 1 min |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys → **test mode** | 1 min |
| `LINEAR_API_KEY` | Linear → Settings → Security & access → Personal API keys | 1 min |
| `NOTION_API_KEY` + `NOTION_PARENT_PAGE_ID` | [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration → Internal → **Configuration** tab → copy the Internal Integration Secret (`ntn_…`). Then open the page Keel should write into → **•••** → **Connections** → add the integration. Sharing the *workspace* is not enough; the page itself must be connected. The page id is the 32-char hex at the end of its URL. | 3 min |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API keys | 1 min |
| `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` | [api.slack.com/apps](https://api.slack.com/apps) → create app → **OAuth & Permissions** (left sidebar, under *Features* — not the credentials on Basic Information) → Bot Token Scopes → add **`chat:write`** → Install to Workspace → copy the **Bot User OAuth Token** (`xoxb-…`). Then `/invite @Keel` in the channel, and copy the channel id from the bottom of its **About** tab. | 5 min |

> **`RESEND_TO_OVERRIDE` is a safety valve, not a workaround.** With it set, every customer email is
> redirected to that address, the intended recipient is preserved in the subject and an
> `X-Keel-Intended-Recipient` header, and the email body says so. Without a verified sending
> domain Resend only delivers to your own address anyway — but this is the posture we would ship
> with in any non-production environment regardless, and it is why the demo can run against
> realistic accounts with zero chance of mailing a real person.

Confirm each app is actually reachable before running anything:

```bash
pnpm preflight
```

One read-only call per connector. It distinguishes the failures that look
identical from the outside — a rejected token, a bot that was never invited to the
channel, a Notion page shared with the workspace but not with the integration — and
prints the fix. No secret is ever printed. It exits non-zero below three reachable
apps.

### Hosted

**[keel-nine-flame.vercel.app](https://keel-nine-flame.vercel.app)** runs the real pipeline
against the same five apps. One caveat stated plainly, and the ledger view repeats it on
screen: a serverless instance has no durable disk, so Keel's state lives in `/tmp` and a cold
start forgets it. Every gate still executes — but the idempotency ledger is only as durable as
the instance, which is weaker than the local guarantee. Customer email is redirected by
`RESEND_TO_OVERRIDE`, so nothing reaches a real person there either.

Then seed the external apps and run:

```bash
pnpm seed   # creates real Stripe customers, subscriptions, a genuinely declined
            # invoice, and labelled Linear tickets. Safe to re-run — everything
            # is looked up before it is created.
pnpm dev    # http://localhost:3100/console
```

`pnpm seed` refuses to run against a live Stripe key.

Useful flags:

```bash
KEEL_DRY_RUN=1 pnpm dev   # trace the whole pipeline, perform no external writes
KEEL_MODEL=claude-sonnet-5 pnpm dev
```

## How I tested and verified it works

Three layers, in increasing order of how much they prove.

### 1. The reliability suite — 18 cases, `pnpm eval`

The suite drives the **real** `evaluatePolicy` and `executePlan` — the same functions the product
runs — against pinned account states, and asserts on what actually happened. Every case checks six
things:

1. The expected policy rules fired for that account state.
2. The approval gate engaged (or did not) exactly as specified.
3. A gated plan that is never approved performs **zero** actions.
4. Exactly the expected actions executed, and exactly the expected actions were blocked.
5. Every executed action carries a **passing post-action verification**.
6. Replaying a completed plan performs **zero** new actions and reports them as skipped.

**Nine must-act cases** cover the happy paths — full save play, usage-decline-only, internal-only
plans that need no human, imminent renewal on a healthy account, documentation-only plays.

**Five must-not-act cases** are the ones that matter, and they are the reason I trust this thing:

| Case | Asserts |
|---|---|
| `do-not-contact` | A tagged account gets **zero** customer contact — *and* the internal task still fires, so the refusal reaches a human |
| `escalation-blocks-email` | Customer email blocked, internal Slack alert still delivered |
| `enterprise-halts` | A $6,800/mo account halts at the approval gate; unapproved ⇒ nothing runs |
| `contact-cooldown` | Contacted 2 days ago ⇒ outreach suppressed, internal task still allowed |
| `idempotent-rerun` | Replaying a completed plan ⇒ 0 executed, 3 skipped |

```
  18/18 cases passed · 5/5 must-not-act cases passed
```

Full generated scorecard: **[`evals/REPORT.md`](evals/REPORT.md)**.

**Two modes, and the difference is stated plainly rather than hidden:**

```bash
pnpm eval          # fixture mode — KEEL_SINK=1 stubs ONLY the third-party
                   # network boundary. Every Keel gate (policy, idempotency,
                   # retry, verification wiring, ledger) still runs for real.
                   # Deterministic, fast, needs no API keys, CI-able.

pnpm eval --live   # identical cases with the stub removed — real writes to the
                   # real Stripe / Linear / Slack / Notion / Resend workspaces.
```

Fixture mode proves the decision logic; live mode proves the integrations. Both are run before
submission.

### 2. End-to-end verification against the real apps

A real run, captured from the live system:

```
→ list_accounts                    6 accounts
→ get_account_snapshot  ×6         all six investigated in parallel
→ propose_save_play                Acme Robotics, risk 92/100

POLICY  CUSTOMER_CONTACT_APPROVAL → require_approval
⏸ halted at the approval gate

[approved]
EXECUTED  create_linear_issue   verified=true  Issue MAR-11 exists with matching title.
EXECUTED  send_customer_email   verified=true  Message 02805b7b… present in Resend, status sent.
executed=2 failed=0
```

The agent chose Acme on its own and, unprompted, flagged a conflict in the evidence: Stripe
reported the subscription `active` while $4,500 sat uncollected, so it told the owner to
establish whether this was a dunning failure or a customer withholding payment on a product
they could not log into — *before* any collections action. That judgment is not in the
system prompt.


After a live run I confirm each write by hand in the app itself — the Linear issue, the Notion
page, the email in the inbox, the Slack message — and check it against what the UI claims. The
UI's green tick is not cosmetic: it only appears when the connector's own `verify*` function
re-fetched that resource by id and the external system confirmed it.

Then the adversarial checks:

- **Replay the identical plan** → `executed=0, skipped=2`, and no duplicate anything in any app:

  ```
  --- approve ---
    executed=2 skipped=0 failed=0
  --- REPLAY same plan ---
     SKIPPED_IDEMPOTENT · create_linear_issue
     SKIPPED_IDEMPOTENT · send_customer_email
    executed=0 skipped=2 failed=0
  ```
- **Run against the `do-not-contact` account** → the customer email is blocked with its reason recorded, and the internal task is created so somebody learns the account is in trouble.
- **Kill a connector mid-run** (revoke the Linear key) → the action retries once, fails honestly,
  and is reported as `failed` rather than silently swallowed.
- **`cat .keel/audit.jsonl`** → every read, decision, policy evaluation, action and
  verification is present, in order, with timestamps.

### 3. Types and lint

`pnpm typecheck` is clean — no `any` in the domain layer, and every connector return type is
modelled in [`lib/types.ts`](lib/types.ts).

## Using it

Open **`http://localhost:3100/console`** — `/` is the product page.

- The left rail shows connector health and the book of business, sorted by a deterministic risk
  score with usage sparklines.
- **"Find the account most at risk and run the save play"** starts an open-ended run — the agent
  picks the account itself.
- Clicking any account investigates that one specifically.
- Watch the run stream: tool calls as they fire, the agent's reasoning, the evidence it gathered
  (each item linking back to the record in the source app), its proposed plan, then the policy
  verdicts.
- If the plan needs a human, it stops at the approval gate. Approve, and the timeline executes —
  each row expanding to show the external id, the idempotency key, and the verification receipt.
- Hit **Re-run** to watch every action come back as skipped.

## Project layout

```
lib/
  agent/          system prompt, tools, the streaming investigation loop
  connectors/     one module per external app — read, write, and verify
  policy.ts       the six deterministic rules
  ledger.ts       the audit trail, read back as a durable record
  paths.ts        where state lives — .keel/ locally, /tmp when hosted
  execute.ts      the five-gate execution pipeline
  idempotency.ts  the action ledger
  audit.ts        append-only event log
  store.ts        account registry, usage telemetry, snapshot assembly
evals/            18 cases + the runner that drives the real pipeline
scripts/
  seed.ts         writes the demo tenancy into Stripe and Linear
  preflight.ts    one read-only call per app — proves each is reachable
app/
  page.tsx        the product page
  console/        the operator console — streaming NDJSON, no polling
  api/            agent, approval, accounts, connectors, ledger
```

## Stack

Next.js 16 · React 19 · TypeScript · Vercel AI SDK v6 (`streamText` + tool loop) ·
`claude-opus-5` · Tailwind v4 with a hand-built token layer · official SDKs for all five apps.
No database — state is durable JSON under `.keel/`, which keeps the clone-to-running path
at two commands.

## Honest limitations

- The account registry and usage telemetry are seeded fixtures. In production these are your own
  database and your own product analytics; the agent's interface to them would not change.
- Quiet-hours deferral is specified in the policy design but not implemented — the four other
  rules are, and are tested.
- Approval lives in Keel's own UI rather than Slack interactivity, which avoids needing a
  public webhook. Slack is notify-only.
- Single-tenant, single-workspace. There is no auth on the console.

## Credits

- Agent tool-card and disclosure primitives adapted from
  [starc007/ui-components](https://github.com/starc007/ui-components) (MIT, © 2026 Saurabh Chauhan).
- Connector brand marks generated from [simple-icons](https://simpleicons.org) at build time
  (`scripts/gen-marks.cjs`). Slack's mark is its own official geometry.
- Typefaces: Inter and JetBrains Mono, self-hosted via `next/font`.

## License

MIT
