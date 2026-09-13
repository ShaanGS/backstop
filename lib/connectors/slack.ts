/** Slack connector — WRITE (owner alert) + verify via permalink read-back. */
import { WebClient } from "@slack/web-api";
import { requireEnv } from "../env";
import type { VerificationResult } from "../types";

let client: WebClient | null = null;
export function slack(): WebClient {
  requireEnv("slack");
  client ??= new WebClient(process.env.SLACK_BOT_TOKEN!);
  return client;
}

export type SlackAlert = {
  accountName: string;
  owner: string;
  headline: string;
  facts: { label: string; value: string }[];
  actions: string[];
  planUrl?: string;
};

export async function postAlert(alert: SlackAlert): Promise<{ ts: string; url: string; channel: string }> {
  const channel = process.env.SLACK_CHANNEL_ID!;
  const res = await slack().chat.postMessage({
    channel,
    text: `Keel: save play executed for ${alert.accountName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `⚠︎ ${alert.accountName} — churn risk`, emoji: true },
      },
      { type: "section", text: { type: "mrkdwn", text: `*${alert.headline}*\nOwner: ${alert.owner}` } },
      {
        type: "section",
        fields: alert.facts.slice(0, 10).map((f) => ({
          type: "mrkdwn" as const,
          text: `*${f.label}*\n${f.value}`,
        })),
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Actions taken by Keel*\n${alert.actions.map((a) => `• ${a}`).join("\n")}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: alert.planUrl
              ? `Save plan: <${alert.planUrl}|Notion> · every action verified by read-back`
              : `Every action verified by read-back`,
          },
        ],
      },
    ],
  });
  if (!res.ok || !res.ts) throw new Error(`Slack postMessage failed: ${res.error ?? "unknown"}`);
  const link = await slack().chat.getPermalink({ channel, message_ts: res.ts });
  return { ts: res.ts, channel, url: link.permalink ?? "" };
}

/**
 * Verification re-resolves the message permalink. If the message did not land
 * (or was removed) Slack returns message_not_found and this fails honestly.
 */
export async function verifyMessage(channel: string, ts: string): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  try {
    const link = await slack().chat.getPermalink({ channel, message_ts: ts });
    return {
      verified: Boolean(link.ok && link.permalink),
      method: "slack.chat.getPermalink(ts)",
      detail: link.permalink ? `Message resolves at ${link.permalink}` : "No permalink returned.",
      checkedAt,
    };
  } catch (err) {
    return {
      verified: false,
      method: "slack.chat.getPermalink(ts)",
      detail: `Re-fetch failed: ${(err as Error).message}`,
      checkedAt,
    };
  }
}
