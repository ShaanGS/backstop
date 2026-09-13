import { NextResponse } from "next/server";
import { readEvalScore, readLedger } from "@/lib/ledger";
import { isEphemeralState } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...readLedger(), evals: readEvalScore(), ephemeral: isEphemeralState });
}
