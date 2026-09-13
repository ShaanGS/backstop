import { buildSnapshot, listAccounts } from "@/lib/store";
import { isConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Short cache so repeated dashboard loads don't re-hammer Stripe and Linear. */
let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 45_000;

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    return Response.json(cache.payload);
  }

  if (!isConfigured("stripe")) {
    return Response.json({
      ready: false,
      reason: "Stripe is not configured. Copy .env.example to .env.local, add your keys, then run `pnpm seed`.",
      accounts: [],
    });
  }

  const settled = await Promise.allSettled(listAccounts().map((a) => buildSnapshot(a.id)));
  const accounts = settled.flatMap((r) =>
    r.status === "fulfilled"
      ? [{
          id: r.value.account.id,
          name: r.value.account.name,
          domain: r.value.account.domain,
          owner: r.value.account.owner,
          contact: r.value.account.contact,
          tags: r.value.account.tags,
          riskScore: r.value.riskScore,
          riskReasons: r.value.riskReasons,
          mrrCents: r.value.billing.mrrCents,
          status: r.value.billing.status,
          daysToRenewal: r.value.billing.daysToRenewal,
          failedPaymentCents: r.value.billing.failedPaymentCents ?? null,
          usage: r.value.usage,
          tickets: r.value.tickets,
          evidence: r.value.evidence,
        }]
      : [],
  );
  accounts.sort((a, b) => b.riskScore - a.riskScore);

  const failures = settled.filter((r) => r.status === "rejected").length;
  const payload = {
    ready: accounts.length > 0,
    reason: accounts.length ? null : "No accounts could be read. Have you run `pnpm seed`?",
    failures,
    accounts,
  };
  cache = { at: Date.now(), payload };
  return Response.json(payload);
}
