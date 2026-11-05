import { logger } from "../../lib/logger";
import type { TripEventEnvelope } from "./types";

export class TripEventBus {
  private readonly listeners = new Set<(event: TripEventEnvelope) => void>();

  subscribe(listener: (event: TripEventEnvelope) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: TripEventEnvelope) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        logger.error("TRIP_EVENT_LISTENER_FAILED");
      }
    }
  }
}
