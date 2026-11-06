import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { logger } from "../../lib/logger";
import type { AuthEnv, AuthService } from "../auth/service";
import type { IndexerService } from "../indexer/service";

export function streamTripEvents(
  context: Context<AuthEnv>,
  indexer: IndexerService,
  auth: AuthService,
  tripId: string,
  after: number,
  token: string,
  heartbeatMs = 15_000,
) {
  context.header("Cache-Control", "no-store");
  context.header("X-Accel-Buffering", "no");
  return streamSSE(context, async (stream) => {
    let closed = false;
    let cursor = after;
    let notified = false;
    let wake: (() => void) | undefined;
    const unsubscribe = indexer.bus.subscribe((event) => {
      if (event.tripId.toLowerCase() === tripId.toLowerCase()) {
        notified = true;
        wake?.();
      }
    });
    stream.onAbort(() => {
      closed = true;
      unsubscribe();
      wake?.();
    });
    try {
      while (!closed) {
        if (!auth.session(token)) break;
        // Notifications are wakeups only: replay from the durable table in ID order,
        // including events committed between subscription and the initial read.
        const events = indexer.events(tripId, cursor, 100);
        if (events.length > 0) {
          for (const event of events) {
            if (closed || !auth.session(token)) {
              closed = true;
              break;
            }
            await stream.writeSSE({
              id: event.id,
              event: event.data.type,
              data: JSON.stringify(event.data),
            });
            cursor = Number(event.id);
          }
          continue;
        }
        if (notified) {
          notified = false;
          continue;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        let heartbeat = false;
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(() => {
            heartbeat = true;
            resolve();
          }, heartbeatMs);
          if (closed || notified) resolve();
        });
        if (timer) clearTimeout(timer);
        wake = undefined;
        notified = false;
        if (heartbeat && !closed && auth.session(token)) await stream.write(": keepalive\n\n");
      }
    } catch {
      if (!closed) logger.error("TRIP_STREAM_WRITE_FAILED");
    } finally {
      closed = true;
      unsubscribe();
      wake?.();
    }
  });
}
