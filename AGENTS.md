# Keel — orientation

An autonomous revenue-retention agent. It investigates why a customer is about to
churn across five external apps, proposes a recovery play, and executes it through
a deterministic pipeline that can refuse.

## Verify it without any credentials

```bash
pnpm install
pnpm eval        # 14/14 cases · 5/5 must-not-act · ~15s, no API keys
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm eval` runs in fixture mode, which stubs **only** the third-party network
boundary (`KEEL_SINK=1`). Every Keel gate — policy evaluation, idempotency lookup,
retry, read-back verification, ledger commit — executes for real. This is why the
suite runs in CI on every push with no secrets configured. `pnpm eval --live` runs
the identical cases against the real APIs.

Anything that needs credentials (`pnpm dev`, `pnpm seed`, `pnpm preflight`) needs
`.env.local`; see `.env.example`. Without them the console still boots and reports
which connectors are unconfigured rather than throwing.

## The one design decision worth reading

Investigation is model-driven; execution is not.

- **Phase 1** — `lib/agent/loop.ts` runs a `streamText` loop with read-only tools.
  The model chooses which accounts to open and when it has enough evidence.
- **Phase 2** — `lib/execute.ts` takes the proposed plan and runs a fixed pipeline:
  policy → approval gate → idempotency → execute (one retry) → verify by read-back
  → ledger. **The model is never consulted in Phase 2.**

`lib/policy.ts` is the reason this is safe: six pure functions of the account and
its signals, returning `allow` / `block` / `require_approval` with a reason. Nothing
the model emits can bypass them, which is also what makes the eval suite meaningful.

## Where things are

| Path | What it is |
|---|---|
| `lib/agent/` | system prompt, tool definitions, the streaming loop |
| `lib/policy.ts` | the six deterministic rules |
| `lib/execute.ts` | the five-gate execution pipeline |
| `lib/idempotency.ts` | `sha256(accountId + actionType + planId)` action ledger |
| `lib/ledger.ts` | the audit trail read back as a durable record |
| `lib/connectors/` | one module per app — read, write, and `verify*` |
| `evals/` | 14 cases and the runner that drives the real pipeline |
| `app/page.tsx` | product page · `app/console/` the operator console |

## Things that look like bugs and are not

- **Two audit trails.** Fixture runs write `.keel/audit.fixture.jsonl`, live runs
  write `.keel/audit.jsonl`. Sharing them would let the eval suite claim work that
  never happened. Same split for the idempotency ledger.
- **A legacy label in `lib/connectors/linear.ts`.** `RECOVERY_LABELS` matches both
  `keel-recovery` and `backstop-recovery`; tickets created before the rename still
  need excluding from the support signal, or the agent's own output pollutes its
  input.
- **`RESEND_TO_OVERRIDE`.** Redirects every customer email to one address and keeps
  the intended recipient in the subject and an `X-Keel-Intended-Recipient` header.
  It is a safety valve, not a stub — the send is real.
- **Ephemeral state when hosted.** `lib/paths.ts` falls back to `/tmp` on serverless,
  where a cold start forgets the ledger. The console says so on screen.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
