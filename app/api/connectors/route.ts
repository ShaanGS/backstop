import { connectorStatus, isDryRun } from "@/lib/env";
import { MODEL } from "@/lib/agent/loop";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    connectors: connectorStatus(),
    model: MODEL,
    modelReady: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    dryRun: isDryRun(),
  });
}
