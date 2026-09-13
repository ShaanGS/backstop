import { resumePlan } from "@/lib/agent/loop";
import { ndjsonResponse } from "@/lib/stream";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { planId?: string; approved?: boolean };
  const { planId, approved } = body;
  if (!planId) return new Response(JSON.stringify({ error: "planId is required" }), { status: 400 });
  return ndjsonResponse((emit) => resumePlan(emit, planId, Boolean(approved)));
}
