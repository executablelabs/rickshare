import type { ItineraryItem, Trip } from "@rickshare/shared";
import { getAddress, keccak256, toHex } from "viem";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { EnsService } from "./service";
import type { EnsStore } from "./store";

/** ENS records are public: only these itinerary fields may be published. */
export function publicItinerary(items: ItineraryItem[]) {
  const lines: string[] = [];
  const clean = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 160);
  for (const item of items) {
    const line = `${item.startsAt} | ${clean(item.title)} | ${clean(item.location)}`;
    if (new TextEncoder().encode([...lines, line].join("\n")).length > 4096) break;
    lines.push(line);
  }
  return lines.join("\n");
}

export class EnsCoordinator {
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  constructor(
    private readonly store: EnsStore,
    private readonly ens: Pick<EnsService, "provisionTrip" | "writeItinerary">,
    private readonly source: {
      trips: () => Trip[];
      itinerary: (tripId: string) => ItineraryItem[];
      refresh: (tripId: string) => void;
      now?: () => number;
    },
  ) {}

  sync() {
    if (this.stopped) return Promise.resolve();
    this.running ??= this.cycle().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async cycle() {
    for (const trip of this.source.trips()) {
      if (this.stopped) return;
      if (Date.parse(trip.endsAt) <= (this.source.now?.() ?? Date.now())) continue;
      try {
        const { input, saved, pending } = this.store.prepare(trip);
        const names = pending
          ? await this.ens.provisionTrip(input)
          : {
              trip: saved.name,
              resolver: getAddress(saved.resolver ?? ""),
            };
        if (this.stopped) return;
        if ("members" in names) this.store.confirm(trip.id, names);
        this.source.refresh(trip.id);
        const summary = publicItinerary(this.source.itinerary(trip.id));
        const hash = keccak256(toHex(summary));
        if (saved.itineraryHash !== hash) {
          await this.ens.writeItinerary(names, summary);
          if (this.stopped) return;
          this.store.published(trip.id, hash);
        }
      } catch (error) {
        if (this.stopped) return;
        const code = error instanceof AppError ? error.code : "ENS_SYNC_FAILED";
        this.store.fail(trip.id, code);
        logger.error(`ENS_SYNC_PENDING.${code}`);
      }
    }
  }

  start(intervalMs: number) {
    if (this.timer) return;
    this.stopped = false;
    const run = () => {
      void this.sync().catch(() => logger.error("ENS_SYNC_PENDING"));
    };
    run();
    this.timer = setInterval(run, intervalMs);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
