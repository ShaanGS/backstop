/** Resend connector — WRITE (customer email) + verify by message retrieve. */
import { Resend } from "resend";
import { requireEnv } from "../env";
import type { VerificationResult } from "../types";

let client: Resend | null = null;
export function resend(): Resend {
  requireEnv("resend");
  client ??= new Resend(process.env.RESEND_API_KEY!);
  return client;
}

export const FROM = process.env.RESEND_FROM ?? "Backstop <onboarding@resend.dev>";

/**
 * Safety valve. When RESEND_TO_OVERRIDE is set, every customer email is
 * redirected to that address with the intended recipient preserved in a header
 * and the subject. This is how the demo runs against real accounts without the
 * possibility of mailing a real person, and it is the posture we would ship
 * with in any non-production environment.
 */
export function resolveRecipient(intended: string): { to: string; redirected: boolean } {
  const override = process.env.RESEND_TO_OVERRIDE?.trim();
  return override ? { to: override, redirected: true } : { to: intended, redirected: false };
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
  accountName: string;
}): Promise<{ id: string; to: string; redirected: boolean }> {
  const { to, redirected } = resolveRecipient(input.to);
  const subject = redirected ? `[sandbox → ${input.to}] ${input.subject}` : input.subject;
  const html = `<div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17181a;max-width:560px">
${input.body
  .split("\n\n")
  .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
  .join("")}
<hr style="border:0;border-top:1px solid #e7e5e1;margin:22px 0">
<p style="font-size:12px;color:#94999f;margin:0">Sent by Backstop on behalf of the ${input.accountName} account team.${
    redirected ? ` Sandbox mode: intended recipient was ${input.to}.` : ""
  }</p></div>`;

  const { data, error } = await resend().emails.send({
    from: FROM,
    to: [to],
    subject,
    html,
    headers: { "X-Backstop-Intended-Recipient": input.to },
  });
  if (error || !data?.id) throw new Error(`Resend send failed: ${error?.message ?? "no id returned"}`);
  return { id: data.id, to, redirected };
}

/** Verification: retrieve the message from Resend and confirm it was accepted. */
export async function verifyEmail(id: string): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  try {
    const { data, error } = await resend().emails.get(id);
    if (error || !data?.id) {
      return { verified: false, method: "resend.emails.get(id)", detail: `Not found: ${error?.message ?? "no data"}`, checkedAt };
    }
    const status = (data as { last_event?: string }).last_event ?? "accepted";
    const ok = !["bounced", "complained", "failed"].includes(status);
    return {
      verified: ok,
      method: "resend.emails.get(id)",
      detail: `Message ${data.id} present in Resend with status "${status}".`,
      checkedAt,
    };
  } catch (err) {
    return { verified: false, method: "resend.emails.get(id)", detail: `Re-fetch failed: ${(err as Error).message}`, checkedAt };
  }
}
