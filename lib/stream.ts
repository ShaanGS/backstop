/** Newline-delimited JSON streaming helper shared by the agent routes. */
import type { AgentEvent } from "./agent/loop";

export function ndjsonResponse(run: (emit: (e: AgentEvent) => void) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: AgentEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        await run(emit);
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
