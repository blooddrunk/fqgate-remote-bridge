import { mkdtemp, readFile, rm, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FqgateStatus } from "../src/fqgate/install/lifecycle.js";
import {
  EventJournal,
  makeRecord,
  MAX_JOURNAL_BYTES,
  MAX_JOURNAL_FILES,
  MAX_RECORD_BYTES,
} from "../src/supervisor/journal.js";
import { normalizeSnapshot, observe, transitions } from "../src/supervisor/model.js";
import { validateWatchOptions, watch } from "../src/supervisor/watch.js";

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function directory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fqgate-supervisor-test-"));
  directories.push(dir);
  return dir;
}
function fqgate(
  lifecycle: FqgateStatus["lifecycle"],
  session: FqgateStatus["health"]["session"] = "connected",
): FqgateStatus {
  return { lifecycle, health: { session } } as FqgateStatus;
}

describe("Phase 7-A supervisor", () => {
  it("normalizes only bounded states and omits raw fields", () => {
    const input = {
      bridge: true,
      fqgate: fqgate("ready", "login_required"),
      tunnel: { installed: true, running: true },
    };
    expect(normalizeSnapshot(input)).toEqual({
      schemaVersion: 1,
      bridge: "ready",
      fqgate: "ready",
      session: "login_required",
      tunnel: "running",
    });
    expect(normalizeSnapshot(input)).toEqual(normalizeSnapshot(input));
    expect(
      normalizeSnapshot({
        bridge: false,
        fqgate: fqgate("unhealthy", "guest"),
        tunnel: { installed: false, running: false },
      }),
    ).toEqual({
      schemaVersion: 1,
      bridge: "unavailable",
      fqgate: "unhealthy",
      session: "guest",
      tunnel: "missing",
    });
    expect(
      normalizeSnapshot({
        bridge: false,
        fqgate: fqgate("incompatible"),
        tunnel: { installed: true, running: false },
      }).fqgate,
    ).toBe("incompatible");
    expect(normalizeSnapshot({ bridge: false }).fqgate).toBe("unknown");
  });

  it("detects failure, recovery and steady-state deduplication with fake adapters", async () => {
    let failed = false;
    const adapters = {
      bridge: async () => true,
      fqgate: async () => {
        if (failed) throw new Error("Bearer secret-payload");
        return fqgate("ready");
      },
      tunnel: async () => ({ installed: true, running: true }),
    };
    const first = await observe(adapters);
    expect(transitions(undefined, first)).toHaveLength(4);
    expect(transitions(first, await observe(adapters))).toEqual([]);
    failed = true;
    const unavailable = await observe(adapters);
    expect(transitions(first, unavailable).map((value) => value.reason)).toEqual([
      "probe_failed",
      "probe_failed",
    ]);
    expect(transitions(unavailable, await observe(adapters))).toEqual([]);
    failed = false;
    expect(transitions(unavailable, await observe(adapters)).map((value) => value.reason)).toEqual([
      "probe_recovered",
      "probe_recovered",
    ]);
  });

  it("writes a fixed schema and rejects payloads, invalid states and unsafe paths", async () => {
    const dir = await directory();
    const journal = new EventJournal(join(dir, "state"), process.cwd());
    const transition = {
      component: "bridge" as const,
      current: "ready" as const,
      reason: "initial" as const,
      rawToken: "secret-payload",
    };
    await journal.append(transition, "2026-09-30T00:00:00.000Z");
    const contents = await readFile(join(dir, "state", "events.jsonl"), "utf8");
    expect(contents).not.toContain("secret-payload");
    expect(JSON.parse(contents)).toEqual({
      schemaVersion: 1,
      at: "2026-09-30T00:00:00.000Z",
      event: "observation",
      component: "bridge",
      current: "ready",
      reason: "initial",
    });
    expect(Buffer.byteLength(contents)).toBeLessThan(MAX_RECORD_BYTES);
    expect(() =>
      makeRecord(
        { component: "bridge", current: "secret-payload" as "ready", reason: "initial" },
        "2026-09-30T00:00:00.000Z",
      ),
    ).toThrow();
    await expect(new EventJournal(join(process.cwd(), "bad-state")).prepare()).rejects.toThrow();
    await symlink(process.cwd(), join(dir, "link"), "dir");
    await expect(new EventJournal(join(dir, "link", "state")).prepare()).rejects.toThrow();
  });

  it("enforces one watcher and hard retention through rotation", async () => {
    const dir = await directory();
    const journal = new EventJournal(join(dir, "state"));
    const release = await journal.acquire();
    await expect(journal.acquire()).rejects.toThrow();
    await release();
    for (let index = 0; index < 2_600; index += 1) {
      await journal.append(
        {
          component: "bridge",
          current: index % 2 === 0 ? "ready" : "unavailable",
          reason: "state_changed",
        },
        "2026-09-30T00:00:00.000Z",
      );
    }
    const counts = await journal.counts();
    expect(counts.rotatedFiles).toBe(MAX_JOURNAL_FILES - 1);
    expect(counts.records).toBeLessThan(2_600);
    for (let index = 0; index < MAX_JOURNAL_FILES; index += 1) {
      const info = await stat(join(dir, "state", `events.jsonl${index === 0 ? "" : `.${index}`}`));
      expect(info.size).toBeLessThanOrEqual(MAX_JOURNAL_BYTES);
    }
  }, 30_000);

  it("bounds cycles and interval without real sleep and performs no actions", async () => {
    const dir = await directory();
    const journal = new EventJournal(join(dir, "state"));
    const adapters = {
      bridge: async () => true,
      fqgate: async () => fqgate("ready"),
      tunnel: async () => ({ installed: true, running: true }),
    };
    const sleeps: number[] = [];
    await watch(adapters, journal, {
      intervalMs: 1_000,
      maxCycles: 3,
      now: () => "2026-09-30T00:00:00.000Z",
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([1_000, 1_000]);
    expect((await journal.counts()).records).toBe(4);
    expect(() => validateWatchOptions({ intervalMs: 999 })).toThrow();
    expect(() => validateWatchOptions({ intervalMs: 60_001 })).toThrow();
    expect(() => validateWatchOptions({ intervalMs: 1_000, maxCycles: 1_001 })).toThrow();
  });
});
