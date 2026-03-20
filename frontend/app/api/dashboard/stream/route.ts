import { buildDashboardSnapshot } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const cleanup = () => {
    closed = true;
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = undefined;
    }
  };

  const safeEnqueue = (chunk: string) => {
    if (closed) {
      return false;
    }

    try {
      controllerRef?.enqueue(encoder.encode(chunk));
      return true;
    } catch {
      cleanup();
      return false;
    }
  };

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      controllerRef = controller;

      let lastSnapshot = "";

      const pushSnapshot = async () => {
        const snapshot = await buildDashboardSnapshot();
        const serialized = JSON.stringify(snapshot);

        if (serialized !== lastSnapshot) {
          if (safeEnqueue(encodeSseEvent("dashboard-update", snapshot))) {
            lastSnapshot = serialized;
          }
        }
      };

      await pushSnapshot();

      interval = setInterval(async () => {
        try {
          await pushSnapshot();
        } catch (error) {
          safeEnqueue(
            encodeSseEvent("dashboard-error", {
              message: error instanceof Error ? error.message : "Unknown stream error",
            }),
          );
        }
      }, 2000);

      keepAlive = setInterval(() => {
        safeEnqueue(": keep-alive\n\n");
      }, 15000);

      safeEnqueue(
        encodeSseEvent("dashboard-ready", {
          connected: true,
        }),
      );
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
