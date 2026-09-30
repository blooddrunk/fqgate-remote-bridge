import type { EventJournal } from "./journal.js";
import { observe, transitions } from "./model.js";
import type { ObservationAdapters, ProbeResult } from "./model.js";

export interface WatchOptions {
  readonly intervalMs: number;
  readonly maxCycles?: number;
  readonly now?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly onCycle?: (result: ProbeResult, cycle: number) => void;
}

export function validateWatchOptions(options: WatchOptions): void {
  if (
    !Number.isSafeInteger(options.intervalMs) ||
    options.intervalMs < 1_000 ||
    options.intervalMs > 60_000
  ) {
    throw new Error("Supervisor interval must be 1000..60000 ms");
  }
  if (
    options.maxCycles !== undefined &&
    (!Number.isSafeInteger(options.maxCycles) || options.maxCycles < 1 || options.maxCycles > 1_000)
  ) {
    throw new Error("Supervisor max cycles must be 1..1000");
  }
}

export async function watch(
  adapters: ObservationAdapters,
  journal: EventJournal,
  options: WatchOptions,
): Promise<void> {
  validateWatchOptions(options);
  const release = await journal.acquire();
  const now = options.now ?? (() => new Date().toISOString());
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let previous: ProbeResult | undefined;
  try {
    for (let cycle = 1; options.maxCycles === undefined || cycle <= options.maxCycles; cycle += 1) {
      const current = await observe(adapters);
      for (const event of transitions(previous, current)) await journal.append(event, now());
      options.onCycle?.(current, cycle);
      previous = current;
      if (options.maxCycles !== undefined && cycle === options.maxCycles) break;
      await sleep(options.intervalMs);
    }
  } finally {
    await release();
  }
}
