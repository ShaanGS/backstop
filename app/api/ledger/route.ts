import { NextResponse } from "next/server";
import { readEvalScore, readLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...readLedger(), evals: readEvalScore() });
}
