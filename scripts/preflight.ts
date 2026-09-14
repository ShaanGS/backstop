/**
 * Preflight — can Keel actually reach each app it claims to be connected to?
 *
 * `isConfigured()` only proves an environment variable is non-placeholder. This
 * makes one cheap, read-only call per connector and reports the real failure:
 * a bad token and a bot that was never invited to the channel look identical
 * from the outside until you ask. Nothing here writes, and no secret is ever
 * printed — only whether it worked, and what to do if it did not.
 */
import "./load-env";
import { CONNECTOR_ENV, CONNECTOR_META, isConfigured } from "../lib/env";
import type { ConnectorId } from "../lib/types";

type Check = { ok: boolean; note: string; fix?: string };

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 120);

async function checkStripe(): Promise<Check> {
  const { stripe } = await import("../lib/connectors/stripe");
  if (!process.env.STRIPE_SECRET_KEY!.startsWith("sk_test_")) {
    return { ok: false, note: "not a test-mode key", fix: "Use the sk_test_… key. Keel refuses to seed against live Stripe." };
  }
  const res = await stripe().customers.list({ limit: 1 });
  return { ok: true, note: `test mode · ${res.data.length ? "customers present" : "no customers yet — run pnpm seed"}` };
}

async function checkLinear(): Promise<Check> {
  const { linear } = await import("../lib/connectors/linear");
  const me = await linear().viewer;
  return { ok: true, note: `authenticated as ${me.name}` };
}

async function checkSlack(): Promise<Check> {
  const { slack } = await import("../lib/connectors/slack");
  const auth = await slack().auth.test();
  const channel = process.env.SLACK_CHANNEL_ID!;

  /* Probe with chat.getPermalink — the same call Keel uses to verify a posted
     alert. A deliberately impossible timestamp means nothing is written, and
     the error distinguishes the cases that matter: "message_not_found" proves
     the channel is reachable, anything else names the real problem. Checking
     membership properly would need channels:read, and Keel has no business
     holding a scope it never uses. */
  try {
    await slack().chat.getPermalink({ channel, message_ts: "0000000000.000000" });
    return { ok: true, note: `@${auth.user} · channel reachable` };
  } catch (e) {
    const err = (e as { data?: { error?: string; needed?: string } }).data?.error ?? msg(e);
    if (err === "message_not_found") {
      return {
        ok: true,
        note: `@${auth.user} in ${auth.team} · channel reachable`,
      };
    }
    if (err === "channel_not_found") {
      return {
        ok: false,
        note: "channel not found",
        fix: `SLACK_CHANNEL_ID should look like C0123ABCDEF — copy it from the bottom of the channel's About tab, not the channel name. If the channel is private, run "/invite @${auth.user}" there first.`,
      };
    }
    if (err === "missing_scope") {
      return {
        ok: false,
        note: "missing scope",
        fix: "OAuth & Permissions → Bot Token Scopes → add chat:write, then Reinstall to Workspace.",
      };
    }
    return { ok: false, note: err };
  }
}

async function checkNotion(): Promise<Check> {
  const { notion, pageId } = await import("../lib/connectors/notion");
  const parent = pageId(process.env.NOTION_PARENT_PAGE_ID!);
  try {
    const page = (await notion().pages.retrieve({ page_id: parent })) as { id: string };
    return { ok: true, note: `parent page ${page.id.slice(0, 8)}… reachable` };
  } catch (e) {
    const m = msg(e);
    if (m.includes("Could not find page") || m.includes("object_not_found")) {
      return {
        ok: false,
        note: "parent page not shared with the integration",
        fix: "Open the page in Notion → ••• menu → Connections → add Keel. Sharing the workspace is not enough; the page itself must be connected.",
      };
    }
    if (m.includes("API token is invalid") || m.includes("unauthorized")) {
      return { ok: false, note: "token rejected", fix: "Copy the Internal Integration Secret (starts ntn_) from notion.so/my-integrations." };
    }
    return { ok: false, note: m };
  }
}

async function checkResend(): Promise<Check> {
  const { resend } = await import("../lib/connectors/resend");
  const { error } = await resend().domains.list();
  if (error) return { ok: false, note: error.message };
  const to = process.env.RESEND_TO_OVERRIDE;
  return {
    ok: true,
    note: to ? `sandboxed → every customer email redirects to ${to}` : "LIVE — no RESEND_TO_OVERRIDE set",
  };
}

const CHECKS: Record<ConnectorId, () => Promise<Check>> = {
  stripe: checkStripe, linear: checkLinear, slack: checkSlack, notion: checkNotion, resend: checkResend,
};

async function main() {
  console.log(`\n  ${bold("Keel preflight")} ${dim("— read-only; no secret is printed")}\n`);
  let configured = 0;
  let reachable = 0;
  const fixes: string[] = [];

  for (const id of Object.keys(CHECKS) as ConnectorId[]) {
    const meta = CONNECTOR_META[id];
    const name = meta.name.padEnd(8);
    if (!isConfigured(id)) {
      console.log(`  ${dim("○")}  ${name} ${dim(`not configured — set ${CONNECTOR_ENV[id].join(", ")}`)}`);
      continue;
    }
    configured++;
    let r: Check;
    try {
      r = await CHECKS[id]();
    } catch (e) {
      r = { ok: false, note: msg(e) };
    }
    if (r.ok) reachable++;
    const mark = r.ok ? green("●") : red("✕");
    const note = r.ok && r.note.startsWith("LIVE") ? amber(r.note) : dim(r.note);
    console.log(`  ${mark}  ${name} ${note}`);
    if (r.fix) fixes.push(`${meta.name}: ${r.fix}`);
  }

  for (const f of fixes) console.log(`\n  ${amber("→")} ${f}`);

  const verdict =
    reachable >= 3
      ? green(`${reachable} of 5 apps reachable.`)
      : red(`${reachable} of 5 apps reachable — Keel needs Stripe and Linear at minimum.`);
  console.log(`\n  ${verdict}${configured > reachable ? dim(` (${configured - reachable} configured but failing)`) : ""}\n`);
  process.exit(reachable >= 3 ? 0 : 1);
}

void main();
