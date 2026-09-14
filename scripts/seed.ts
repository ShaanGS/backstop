/**
 * Seeds the external apps with the demo tenancy.
 *
 * This writes REAL objects into Stripe test mode and Linear: customers,
 * subscriptions with controlled renewal dates, a genuinely failed invoice, and
 * labelled support tickets. Keel then reads all of it back over the live
 * APIs — nothing about the signal path is mocked.
 *
 * Safe to re-run: every object is looked up before it is created.
 */
import "./load-env";
import Stripe from "stripe";
import { LinearClient } from "@linear/sdk";
import { readSeedMap, seedAccounts, writeSeedMap, type SeedMap } from "../lib/store";

const DAY = 86_400;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const linear = process.env.LINEAR_API_KEY ? new LinearClient({ apiKey: process.env.LINEAR_API_KEY }) : null;

function log(icon: string, msg: string) {
  console.log(`${icon} ${msg}`);
}

/**
 * Stripe v22 requires a real Product + Price rather than an inline price_data
 * blob. Both are looked up by metadata so re-seeding reuses them.
 */
async function priceFor(acc: { id: string; plan: string; seats: number; mrrCents: number }): Promise<string> {
  const existing = await stripe.prices.search({
    query: `metadata['keel_account_id']:'${acc.id}' AND active:'true'`,
    limit: 1,
  }).catch(() => ({ data: [] as Stripe.Price[] }));
  if (existing.data.length) return existing.data[0].id;

  const product = await stripe.products.create({
    name: `Keel ${acc.plan} — ${acc.seats} seats`,
    metadata: { keel_account_id: acc.id },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: acc.mrrCents,
    recurring: { interval: "month" },
    metadata: { keel_account_id: acc.id },
  });
  return price.id;
}

async function seedStripe(map: SeedMap) {
  if (!process.env.STRIPE_SECRET_KEY) {
    log("⚠", "STRIPE_SECRET_KEY missing — skipping Stripe seed.");
    return;
  }
  if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    throw new Error("Refusing to seed: STRIPE_SECRET_KEY is not a test-mode key (sk_test_…).");
  }

  for (const acc of seedAccounts()) {
    let customerId = map[acc.id]?.stripeCustomerId;
    if (customerId) {
      const existing = await stripe.customers.retrieve(customerId).catch(() => null);
      if (!existing || (existing as Stripe.DeletedCustomer).deleted) customerId = undefined;
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: acc.name,
        email: acc.contact.email,
        description: `${acc.plan} plan · ${acc.seats} seats · owned by ${acc.owner.name}`,
        metadata: { keel_account_id: acc.id, domain: acc.domain, tags: acc.tags.join(",") },
      });
      customerId = customer.id;
      log("+", `Stripe customer ${customer.id} — ${acc.name}`);
    } else {
      log("=", `Stripe customer ${customerId} — ${acc.name} (reused)`);
    }

    // Attach a card. The failed-payment account gets a card that always declines.
    // chargeCustomerFail attaches cleanly but declines when charged, which is how we
    // produce a genuine uncollected invoice rather than a fake status string.
    const pm = acc.failedPayment ? "pm_card_chargeCustomerFail" : "pm_card_visa";
    const attached = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
    if (!attached.data.length) {
      try {
        const method = await stripe.paymentMethods.attach(pm, { customer: customerId });
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: method.id } });
      } catch (err) {
        log("⚠", `  could not attach ${pm}: ${(err as Error).message}`);
      }
    }

    // One active subscription per account, with the renewal date pinned by a
    // future billing-cycle anchor so the demo is never stale.
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 3 });
    if (!subs.data.some((s) => ["active", "past_due", "trialing", "unpaid"].includes(s.status))) {
      await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: await priceFor(acc) }],
        // Stripe rejects an anchor beyond the next natural billing date, so cap at 28d.
        billing_cycle_anchor: Math.floor(Date.now() / 1000) + Math.min(acc.renewalInDays, 28) * DAY,
        proration_behavior: "none",
        payment_behavior: "allow_incomplete",
        metadata: { keel_account_id: acc.id },
      });
      log("+", `  subscription $${(acc.mrrCents / 100).toLocaleString()}/mo, renews in ${acc.renewalInDays}d`);
    }

    // A real uncollected invoice for the failed-payment account.
    if (acc.failedPayment) {
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 });
      const alreadyFailed = invoices.data.some((i) => i.status === "open" && (i.attempt_count ?? 0) > 0);
      if (!alreadyFailed) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: acc.mrrCents,
          currency: "usd",
          description: "Subscription renewal",
        });
        const invoice = await stripe.invoices.create({
          customer: customerId,
          collection_method: "charge_automatically",
          auto_advance: false,
          // Stripe excludes pending invoice items by default; without this the
          // invoice finalises at $0 and auto-pays, and there is no failure to find.
          pending_invoice_items_behavior: "include",
          metadata: { keel_account_id: acc.id },
        });
        await stripe.invoices.finalizeInvoice(invoice.id!);
        try {
          await stripe.invoices.pay(invoice.id!);
          log("⚠", `  invoice ${invoice.id} unexpectedly succeeded`);
        } catch {
          log("+", `  invoice ${invoice.id} declined — failed payment signal is live`);
        }
      } else {
        log("=", `  failed invoice already present`);
      }
    }

    map[acc.id] = { ...map[acc.id], stripeCustomerId: customerId };
    writeSeedMap(map);
  }
}

async function seedLinear(map: SeedMap) {
  if (!linear) {
    log("⚠", "LINEAR_API_KEY missing — skipping Linear seed.");
    return;
  }
  const team = (await linear.teams({ first: 1 })).nodes[0];
  if (!team) throw new Error("No Linear team available for this API key.");
  log("·", `Linear team: ${team.name} (${team.key})`);

  const existingLabels = await team.labels();
  const labelIds = new Map(existingLabels.nodes.map((l) => [l.name.toLowerCase(), l.id]));

  async function labelId(name: string): Promise<string> {
    const hit = labelIds.get(name.toLowerCase());
    if (hit) return hit;
    const created = await linear!.createIssueLabel({ teamId: team.id, name });
    const label = await created.issueLabel;
    labelIds.set(name.toLowerCase(), label!.id);
    return label!.id;
  }

  for (const acc of seedAccounts()) {
    const ids: string[] = [];
    for (const ticket of acc.tickets ?? []) {
      const title = `[${acc.name}] ${ticket.title}`;
      /* Keel reads the report date back out of this body, because a seeded
         tenancy is all created at seed time. It therefore has to be
         reconciled, not merely skipped — otherwise changing ageDays in the
         fixture silently leaves the external tenancy on the old timeline. */
      const body = `Reported by ${acc.contact.name} (${acc.contact.role}) at ${acc.name}.\n\nOpened ${ticket.ageDays} days ago. Seeded by Keel.`;
      const found = await linear.issues({ filter: { title: { eq: title } }, first: 1 });
      if (found.nodes.length) {
        const existing = found.nodes[0];
        ids.push(existing.id);
        if (existing.description !== body) {
          await linear.updateIssue(existing.id, { description: body });
          log("~", `Linear ${existing.identifier} — ${title} (report date reconciled)`);
        } else {
          log("=", `Linear ${existing.identifier} — ${title} (reused)`);
        }
        continue;
      }
      const created = await linear.createIssue({
        teamId: team.id,
        title,
        description: body,
        priority: ticket.labels.includes("escalation") ? 1 : 2,
        labelIds: await Promise.all(ticket.labels.map(labelId)),
      });
      const issue = await created.issue;
      if (issue) {
        ids.push(issue.id);
        log("+", `Linear ${issue.identifier} — ${title}`);
      }
    }
    map[acc.id] = { ...map[acc.id], linearIssueIds: ids };
    writeSeedMap(map);
  }
}

async function main() {
  console.log("\n  Keel — seeding external apps\n");
  const map = readSeedMap();
  await seedStripe(map);
  await seedLinear(map);
  writeSeedMap(map);
  console.log(`\n  Done. Seed map written to data/seed-map.json\n`);
}

main().catch((err) => {
  console.error("\n  Seed failed:", err.message, "\n");
  process.exit(1);
});
