import { runAgent } from "@/lib/agent/loop";
import { ndjsonResponse } from "@/lib/stream";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { instruction?: string; accountId?: string };
  const instruction =
    body.instruction?.trim() ||
    (body.accountId
      ? `Investigate account ${body.accountId} specifically. Pull its full snapshot, decide whether it is genuinely at risk, and if so propose the save play.`
      : "Review the book of business and run the save play for the single account most at risk of churning.");

  return ndjsonResponse((emit) => runAgent(emit, { instruction }));
}
