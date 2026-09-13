/**
 * Account registry and signal assembly.
 *
 * `data/accounts.json` is Backstop's own first-party CRM + product-telemetry
 * store — the same data a real vendor would hold in its own database. Billing
 * and support signals are NOT read from here: they are fetched live from Stripe
 * and Linear at snapshot time. This file only supplies the registry, the
 * usage timeseries, and the id map produced by `pnpm seed`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import accountsRaw from "../data/accounts.json";
import { getBilling, customerUrl } from "./connectors/stripe";
import { getTickets } from "./connectors/linear";
import { isConfigured } from "./env";
import type { Account, BillingSignal, Evidence, Ticket, UsageSignal } from "./types";

export type SeedAccount = (typeof accountsRaw)[number];

const MAP_PATH = join(process.cwd(), ".backstop", "seed-map.json");

export type SeedMap = Record<string, { stripeCustomerId?: string; linearIssueIds?: string[] }>;

export function readSeedMap(): SeedMap {
  if (!existsSync(MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MAP_PATH, "utf8")) as SeedMap;
  } catch {
    return {};
  }
}

export function writeSeedMap(map: SeedMap) {
  const dir = dirname(MAP_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf8");
}

export function seedAccounts(): SeedAccount[] {
  return accountsRaw as SeedAccount[];
}

export function listAccounts(): Account[] {
  const map = readSeedMap();
  return seedAccounts().map((a) => ({
    id: a.id,
    name: a.name,
    domain: a.domain,
    owner: a.owner,
    contact: a.contact,
    tags: a.tags,
    timezone: a.timezone,
    stripeCustomerId: map[a.id]?.stripeCustomerId ?? "",
    lastContactedAt:
      "contactedDaysAgo" in a && typeof a.contactedDaysAgo === "number"
        ? new Date(Date.now() - a.contactedDaysAgo * 86_400_000).toISOString()
        : undefined,
  }));
}

export function getAccount(id: string): Account {
  const found = listAccounts().find((a) => a.id === id);
  if (!found) throw new Error(`Unknown account "${id}"`);
  return found;
}

/** First-party product telemetry: weekly active seats, trailing 8 weeks. */
export function getUsage(accountId: string): UsageSignal {
  const seed = seedAccounts().find((a) => a.id === accountId);
  if (!seed) throw new Error(`Unknown account "${accountId}"`);
  const series = seed.usage;
  const current = series[series.length - 1];
  // Baseline is the mean of weeks 1-4, before any decline began.
  const baseline = Math.round(series.slice(0, 4).reduce((a, b) => a + b, 0) / 4);
  return {
    series,
    current,
    baseline,
    changePct: Math.round(((current - baseline) / baseline) * 1000) / 10,
  };
}

export type AccountSnapshot = {
  account: Account;
  billing: BillingSignal;
  usage: UsageSignal;
  tickets: Ticket[];
  riskScore: number;
  riskReasons: string[];
  evidence: Evidence[];
};

/** Deterministic 0-100 risk score. Pure function of the signals — testable. */
export function scoreRisk(billing: BillingSignal, usage: UsageSignal, tickets: Ticket[]) {
  let score = 0;
  const reasons: string[] = [];

  if (usage.changePct <= -50) { score += 35; reasons.push(`Usage down ${Math.abs(usage.changePct)}% vs baseline`); }
  else if (usage.changePct <= -30) { score += 25; reasons.push(`Usage down ${Math.abs(usage.changePct)}% vs baseline`); }
  else if (usage.changePct <= -15) { score += 12; reasons.push(`Usage down ${Math.abs(usage.changePct)}% vs baseline`); }

  if (billing.failedPaymentCents) { score += 25; reasons.push(`Failed payment of $${(billing.failedPaymentCents / 100).toFixed(2)}`); }
  if (billing.status === "past_due" || billing.status === "unpaid") { score += 5; reasons.push(`Subscription is ${billing.status}`); }

  if (billing.daysToRenewal <= 14) { score += 20; reasons.push(`Renewal in ${billing.daysToRenewal} days`); }
  else if (billing.daysToRenewal <= 30) { score += 10; reasons.push(`Renewal in ${billing.daysToRenewal} days`); }

  const open = tickets.filter((t) => t.state !== "Done");
  if (open.length >= 2) { score += 12; reasons.push(`${open.length} unresolved support tickets`); }
  else if (open.length === 1) { score += 6; reasons.push(`1 unresolved support ticket`); }

  if (open.some((t) => t.labels.some((l) => l.toLowerCase() === "escalation"))) {
    score += 15;
    reasons.push("Open escalation");
  }
  return { score: Math.min(100, score), reasons };
}

let evidenceSeq = 0;
const ev = (e: Omit<Evidence, "id" | "retrievedAt">): Evidence => ({
  id: `ev_${(++evidenceSeq).toString(36)}`,
  retrievedAt: new Date().toISOString(),
  ...e,
});

/**
 * Fetches every signal for an account from its real source and assembles the
 * evidence list the agent reasons over. Each evidence item carries the app it
 * came from and a link back to the record, which is what the UI cites.
 */
export async function buildSnapshot(accountId: string): Promise<AccountSnapshot> {
  const account = getAccount(accountId);
  const usage = getUsage(accountId);

  const [billing, tickets] = await Promise.all([
    isConfigured("stripe") && account.stripeCustomerId
      ? getBilling(account.stripeCustomerId)
      : Promise.reject(new Error("Stripe is not configured or the account has not been seeded. Run `pnpm seed`.")),
    isConfigured("linear") ? getTickets(account.name).catch(() => [] as Ticket[]) : Promise.resolve([] as Ticket[]),
  ]);

  const { score, reasons } = scoreRisk(billing, usage, tickets);

  const evidence: Evidence[] = [
    ev({
      source: "stripe",
      label: "Subscription",
      detail: `$${(billing.mrrCents / 100).toLocaleString()}/mo ${billing.currency}, status "${billing.status}", renews in ${billing.daysToRenewal} days.`,
      url: customerUrl(account.stripeCustomerId),
    }),
    ...(billing.failedPaymentCents
      ? [ev({
          source: "stripe",
          label: "Failed payment",
          detail: `Invoice for $${(billing.failedPaymentCents / 100).toFixed(2)} has not collected.`,
          url: billing.failedInvoiceUrl,
        })]
      : []),
    ev({
      source: "usage",
      label: "Product usage",
      detail: `Weekly active seats ${usage.current} vs baseline ${usage.baseline} (${usage.changePct > 0 ? "+" : ""}${usage.changePct}%). Trailing 8 weeks: ${usage.series.join(" → ")}.`,
    }),
    ...tickets
      .filter((t) => t.state !== "Done")
      .map((t) =>
        ev({
          source: "linear",
          label: `Ticket ${t.identifier}`,
          detail: `"${t.title}" — ${t.state}, labels: ${t.labels.join(", ") || "none"}.`,
          url: t.url,
        }),
      ),
    ...(account.tags.length
      ? [ev({ source: "linear", label: "Account tags", detail: account.tags.join(", ") })]
      : []),
  ];

  return { account, billing, usage, tickets, riskScore: score, riskReasons: reasons, evidence };
}
