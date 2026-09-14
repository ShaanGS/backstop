import { NextResponse } from "next/server";
import { readEvalScore, readLedger, readRunMetrics } from "@/lib/ledger";
import { isEphemeralState } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ...readLedger(),
      metrics: readRunMetrics().summary,
      evals: readEvalScore(),
      ephemeral: isEphemeralState,
    });
  } catch {
    /* The console stays usable without its history. */
    return NextResponse.json({
      entries: [],
      summary: { total: 0, executed: 0, verified: 0, blocked: 0, skipped: 0, failed: 0, runs: 0, apps: [] },
      metrics: null,
      evals: null,
      ephemeral: isEphemeralState,
    });
  }
}
