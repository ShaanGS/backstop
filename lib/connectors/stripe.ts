/** Stripe connector — READ. Source of truth for MRR, renewal and failed payments. */
import Stripe from "stripe";
import { requireEnv } from "../env";
import type { BillingSignal } from "../types";

let client: Stripe | null = null;
export function stripe(): Stripe {
  requireEnv("stripe");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export const DASHBOARD = "https://dashboard.stripe.com/test";

/**
 * Reads live billing state for a customer: the active subscription's MRR and
 * renewal date, plus the most recent uncollectible/open invoice if a payment
 * has failed. Everything here is a real Stripe API read.
 */
export async function getBilling(customerId: string): Promise<BillingSignal> {
  const s = stripe();
  const subs = await s.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 5,
    expand: ["data.items.data.price"],
  });
  const sub =
    subs.data.find((x) => ["active", "past_due", "unpaid", "trialing"].includes(x.status)) ??
    subs.data[0];
  if (!sub) throw new Error(`No subscription found for Stripe customer ${customerId}`);

  const mrrCents = sub.items.data.reduce((sum, item) => {
    const price = item.price;
    const unit = price.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    const perMonth = price.recurring?.interval === "year" ? unit / 12 : unit;
    return sum + perMonth * qty;
  }, 0);

  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end ??
    Math.floor(Date.now() / 1000);
  const renewal = new Date(periodEnd * 1000);
  const daysToRenewal = Math.max(0, Math.round((renewal.getTime() - Date.now()) / 86_400_000));

  const invoices = await s.invoices.list({ customer: customerId, limit: 10 });
  const failed = invoices.data.find(
    (inv) => inv.status === "open" && (inv.attempt_count ?? 0) > 0,
  );

  return {
    mrrCents: Math.round(mrrCents),
    currency: (sub.currency ?? "usd").toUpperCase(),
    renewalDate: renewal.toISOString(),
    daysToRenewal,
    status: sub.status,
    failedPaymentCents: failed?.amount_due,
    failedPaymentAt: failed?.created ? new Date(failed.created * 1000).toISOString() : undefined,
    failedInvoiceUrl: failed?.hosted_invoice_url ?? (failed ? `${DASHBOARD}/invoices/${failed.id}` : undefined),
  };
}

export function customerUrl(customerId: string) {
  return `${DASHBOARD}/customers/${customerId}`;
}
