import { describe, expect, it } from "vitest";
import {
  createFixtureFence,
  inspectFixtureTopology,
  type FixtureInstance,
  type FixtureOperation,
} from "./helpers/mp3-isolation-model.js";

const A = `p_${"a".repeat(32)}`,
  B = `p_${"b".repeat(32)}`;
function topology(): FixtureInstance[] {
  return [A, B].map((alias, n) => ({
    alias,
    port: 19001 + n,
    process: {
      pid: 10 + n,
      created: "fixture-created-1",
      executable: "C:\\fixture\\FQGate.exe",
      alive: true,
    },
    listener: { address: "127.0.0.1", pid: 10 + n },
    worker: { pid: 20 + n, parentPid: 10 + n, created: "fixture-worker-1", restarts: 0 },
    storage: {
      data: `C:\\fixture\\${n}\\data`,
      webview: `C:\\fixture\\${n}\\webview`,
      savedLogin: `C:\\fixture\\${n}\\saved`,
      links: "clear",
    },
    source: { id: "same-process-local-id", number: 1, state: "connected" },
    fixtureAccount: `synthetic-account-${n}`,
    fixtureEpoch: "synthetic-epoch-1",
    l2: true,
    flags: [],
  }));
}
const identity = <T>(p: Promise<T>) => p;
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness() {
  const rows = topology(),
    fence = createFixtureFence(() => rows);
  const calls: string[] = [];
  const run = (
    alias = A,
    operation: FixtureOperation = "lookup",
    extra: Partial<Parameters<typeof fence.run>[0]> = {},
  ) =>
    fence.run({
      alias,
      operation,
      within: identity,
      work: async (target) => {
        calls.push(target);
        return { alias: target, value: target === A ? "A-only" : "B-only" };
      },
      ...extra,
    });
  return { rows, fence, calls, run };
}

describe("MP3 topology requirements (FIXTURE_ONLY, never native acceptance)", () => {
  it("MP3-01 separate process/port/storage remains UNKNOWN even with synthetic account epochs", () => {
    const r = inspectFixtureTopology(topology());
    expect(r).toEqual({
      evidence: "FIXTURE_ONLY",
      consistent: true,
      failures: [],
      nativeEngineeringDecision: "UNKNOWN",
      qualification: "LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED",
    });
  });
  const conflicts: [string, (rows: FixtureInstance[]) => void, string][] = [
    [
      "duplicate port",
      (r) => {
        r[1]!.port = r[0]!.port;
      },
      "PORT_CONFLICT",
    ],
    [
      "duplicate alias",
      (r) => {
        r[1]!.alias = A;
      },
      "ALIAS_CONFLICT",
    ],
    [
      "duplicate process",
      (r) => {
        r[1]!.process.pid = 10;
      },
      "PROCESS_CONFLICT",
    ],
    [
      "missing listener",
      (r) => {
        r[0]!.listener = null;
      },
      "LISTENER_ABSENT",
    ],
    [
      "IPv6 listener",
      (r) => {
        r[0]!.listener!.address = "::1";
      },
      "LISTENER_OWNERSHIP",
    ],
    [
      "wildcard listener",
      (r) => {
        r[0]!.listener!.address = "0.0.0.0";
      },
      "LISTENER_OWNERSHIP",
    ],
    [
      "foreign port owner",
      (r) => {
        r[0]!.listener!.pid = 99;
      },
      "LISTENER_OWNERSHIP",
    ],
    [
      "foreign worker parent",
      (r) => {
        r[0]!.worker.parentPid = 11;
      },
      "WORKER_OWNERSHIP",
    ],
    [
      "process exit",
      (r) => {
        r[0]!.process.alive = false;
      },
      "PROCESS_UNAVAILABLE",
    ],
    [
      "unknown creation",
      (r) => {
        r[0]!.worker.created = "";
      },
      "PROCESS_UNAVAILABLE",
    ],
    [
      "identical data",
      (r) => {
        r[1]!.storage.data = r[0]!.storage.data.toUpperCase();
      },
      "STORAGE_OVERLAP",
    ],
    [
      "nested data",
      (r) => {
        r[1]!.storage.data = r[0]!.storage.data + "\\child";
      },
      "STORAGE_OVERLAP",
    ],
    [
      "shared WebView",
      (r) => {
        r[1]!.storage.webview = r[0]!.storage.webview;
      },
      "STORAGE_OVERLAP",
    ],
    [
      "shared saved-login",
      (r) => {
        r[1]!.storage.savedLogin = r[0]!.storage.savedLogin;
      },
      "STORAGE_OVERLAP",
    ],
    [
      "cross-role storage",
      (r) => {
        r[1]!.storage.data = r[0]!.storage.webview;
      },
      "STORAGE_OVERLAP",
    ],
    [
      "symlink/reparse",
      (r) => {
        r[1]!.storage.links = "link";
      },
      "STORAGE_LINK_OR_UNKNOWN",
    ],
    [
      "unreadable link evidence",
      (r) => {
        r[1]!.storage.links = "unknown";
      },
      "STORAGE_LINK_OR_UNKNOWN",
    ],
    [
      "Win32 trailing-dot alias",
      (r) => {
        r[1]!.storage.data = "C:\\fixture\\0\\data.";
      },
      "STORAGE_PATH_AMBIGUOUS",
    ],
    [
      "same-account tokens",
      (r) => {
        r[1]!.fixtureAccount = r[0]!.fixtureAccount;
      },
      "DUPLICATE_FIXTURE_ACCOUNT",
    ],
    [
      "no account evidence",
      (r) => {
        r[0]!.fixtureAccount = "";
      },
      "FIXTURE_IDENTITY_UNKNOWN",
    ],
    [
      "no epoch evidence",
      (r) => {
        r[0]!.fixtureEpoch = "";
      },
      "FIXTURE_IDENTITY_UNKNOWN",
    ],
  ];
  it.each(conflicts)("MP3-02 rejects %s", (_name, change, reason) => {
    const rows = topology();
    change(rows);
    const r = inspectFixtureTopology(rows);
    expect(r.consistent).toBe(false);
    expect(r.failures).toContain(reason);
    expect(r.nativeEngineeringDecision).toBe("UNKNOWN");
    expect(JSON.stringify(r)).not.toMatch(/synthetic-account|C:\\\\fixture/);
  });
  it.each([
    "--port=19001",
    "--data-root=C:\\isolated",
    "--user-data-dir=C:\\isolated",
    "--source-worker",
  ])("MP3-03 refuses undocumented proposal %s without executing the binary", (flag) => {
    const rows = topology();
    rows[0]!.flags = [flag];
    expect(inspectFixtureTopology(rows).failures).toContain("UNDOCUMENTED_LAUNCH_ARGUMENT");
  });
  it("MP3-04 rejects wrong topology count, but process-local source IDs may coincide", () => {
    expect(inspectFixtureTopology([]).consistent).toBe(false);
    expect(inspectFixtureTopology(topology().slice(0, 1)).consistent).toBe(false);
    expect(inspectFixtureTopology(topology()).consistent).toBe(true);
  });
});

describe("MP3 old requests and A/B routing requirements (injected fakes only)", () => {
  it("MP3-05 same query reversed completion never shares a result", async () => {
    const t = harness(),
      a = deferred<{ alias: string; value: string }>();
    const first = t.run(A, "lookup", { work: () => a.promise });
    expect(await t.run(B)).toMatchObject({ outcome: "PUBLISHED", value: "B-only" });
    a.resolve({ alias: A, value: "A-only" });
    expect(await first).toMatchObject({ outcome: "PUBLISHED", value: "A-only" });
  });
  const drifts: [string, (rows: FixtureInstance[]) => void][] = [
    [
      "PID reuse creation",
      (r) => {
        r[0]!.process.created += "new";
      },
    ],
    [
      "worker creation",
      (r) => {
        r[0]!.worker.created += "new";
      },
    ],
    [
      "worker parent",
      (r) => {
        r[0]!.worker.parentPid++;
      },
    ],
    [
      "worker restart",
      (r) => {
        r[0]!.worker.restarts++;
      },
    ],
    [
      "source deletion",
      (r) => {
        r[0]!.source.id = "";
      },
    ],
    [
      "source recreation",
      (r) => {
        r[0]!.source.id += "new";
      },
    ],
    [
      "source renumber",
      (r) => {
        r[0]!.source.number++;
      },
    ],
    [
      "process exit",
      (r) => {
        r[0]!.process.alive = false;
      },
    ],
    [
      "peer account contamination",
      (r) => {
        r[1]!.fixtureAccount = "unexpected";
      },
    ],
    [
      "peer saved-login overlap",
      (r) => {
        r[1]!.storage.savedLogin = r[0]!.storage.savedLogin;
      },
    ],
    [
      "peer L2 displacement",
      (r) => {
        r[1]!.l2 = false;
      },
    ],
    [
      "session epoch",
      (r) => {
        r[0]!.fixtureEpoch += "new";
      },
    ],
    [
      "listener exit",
      (r) => {
        r[0]!.listener = null;
      },
    ],
  ];
  it.each(drifts)(
    "MP3-06 %s discards all four delayed operation results",
    async (_name, change) => {
      for (const operation of ["lookup", "status", "qr.begin", "qr.poll"] as const) {
        const t = harness(),
          result = deferred<{ alias: string; value: string }>();
        const begin = operation === "qr.poll" ? await t.run(A, "qr.begin") : undefined;
        const first = t.run(A, operation, {
          ...(begin && "flow" in begin ? { flow: begin.flow } : {}),
          work: () => result.promise,
        });
        change(t.rows);
        result.resolve({ alias: A, value: "PRIVATE_STALE" });
        expect(await first).toEqual({ evidence: "FIXTURE_ONLY", outcome: "DISCARDED" });
      }
    },
  );
  it("MP3-07 disconnected A never falls back to connected B", async () => {
    const t = harness();
    t.rows[0]!.source.state = "disconnected";
    expect(await t.run(A)).toMatchObject({ outcome: "DISCARDED" });
    expect(t.calls).toEqual([]);
    expect(await t.run(B)).toMatchObject({ value: "B-only" });
  });
  it.each(["lookup", "status", "qr.begin", "qr.poll"] as const)(
    "MP3-08 foreign attribution on %s never publishes",
    async (operation) => {
      const t = harness(),
        begin = operation === "qr.poll" ? await t.run(A, "qr.begin") : undefined;
      expect(
        await t.run(A, operation, {
          ...(begin && "flow" in begin ? { flow: begin.flow } : {}),
          work: async () => ({ alias: B, value: "PRIVATE_FOREIGN" }),
        }),
      ).toMatchObject({ outcome: "DISCARDED" });
    },
  );
  it("MP3-09 QR owner mismatch denies before work; flow invalidated by restart fence", async () => {
    const t = harness(),
      begin = await t.run(A, "qr.begin");
    if (!("flow" in begin)) throw Error();
    expect(await t.run(B, "qr.poll", { flow: begin.flow })).toMatchObject({ outcome: "DISCARDED" });
    expect(t.calls).toEqual([A]);
    t.fence.invalidate();
    expect(await t.run(A, "qr.poll", { flow: begin.flow })).toMatchObject({ outcome: "DISCARDED" });
    expect(t.calls).toEqual([A]);
  });
  it("MP3-10 QR begins are globally serialized and invalidate delayed peer lookup", async () => {
    const t = harness(),
      q = deferred<{ alias: string; value: string }>(),
      b = deferred<{ alias: string; value: string }>();
    const query = t.run(B, "lookup", { work: () => b.promise });
    const qr = t.run(A, "qr.begin", { work: () => q.promise });
    expect(await t.run(B, "qr.begin")).toMatchObject({ outcome: "DISCARDED" });
    b.resolve({ alias: B, value: "STALE" });
    expect(await query).toMatchObject({ outcome: "DISCARDED" });
    q.resolve({ alias: A, value: "fixture-qr" });
    await qr;
    expect(t.calls).toEqual([]);
  });
  it("MP3-11 timeout retains the auth mutex until unsettled work ends; late work has no publication", async () => {
    const t = harness(),
      q = deferred<{ alias: string; value: string }>();
    expect(
      await t.run(A, "qr.begin", {
        work: () => q.promise,
        within: async () => {
          throw Error("fixture-timeout");
        },
      }),
    ).toMatchObject({ outcome: "DISCARDED" });
    expect(await t.run(B, "qr.begin")).toMatchObject({ outcome: "DISCARDED" });
    expect(t.calls).toEqual([]);
    q.resolve({ alias: A, value: "PRIVATE_LATE_QR" });
    await q.promise;
    await Promise.resolve();
    expect(await t.run(B, "qr.begin")).toMatchObject({ outcome: "PUBLISHED" });
  });
  it("MP3-12 cancellation suppresses delayed result without undoing native effects", async () => {
    const t = harness(),
      q = deferred<{ alias: string; value: string }>(),
      signal = new AbortController();
    let effects = 0;
    const first = t.run(A, "qr.begin", {
      work: () => {
        effects++;
        return q.promise;
      },
      signal: signal.signal,
    });
    signal.abort();
    q.resolve({ alias: A, value: "PRIVATE_CANCELLED" });
    expect(await first).toMatchObject({ outcome: "DISCARDED" });
    expect(effects).toBe(1);
    expect(t.calls).toEqual([]);
  });
  it("MP3-13 old process/flow cannot survive model reconstruction", async () => {
    const t = harness(),
      begin = await t.run(A, "qr.begin"),
      second = harness();
    if (!("flow" in begin)) throw Error();
    expect(await second.run(A, "qr.poll", { flow: begin.flow })).toMatchObject({
      outcome: "DISCARDED",
    });
    expect(second.calls).toEqual([]);
  });
  it("MP3-15 repeated owned polls work until explicit invalidation", async () => {
    const t = harness(),
      begin = await t.run(A, "qr.begin");
    if (!("flow" in begin)) throw Error();
    for (let n = 0; n < 2; n++)
      expect(await t.run(A, "qr.poll", { flow: begin.flow })).toMatchObject({
        outcome: "PUBLISHED",
      });
    t.fence.invalidate();
    expect(await t.run(A, "qr.poll", { flow: begin.flow })).toMatchObject({ outcome: "DISCARDED" });
    expect(t.calls).toEqual([A, A, A]);
  });
  it.each(["lookup", "status", "qr.begin", "qr.poll"] as const)(
    "MP3-16 %s timeout and late rejection causes no retry or foreign work",
    async (operation) => {
      const t = harness(),
        late = deferred<{ alias: string; value: string }>();
      const begin = operation === "qr.poll" ? await t.run(A, "qr.begin") : undefined;
      let effects = 0;
      const result = await t.run(A, operation, {
        ...(begin && "flow" in begin ? { flow: begin.flow } : {}),
        work: () => {
          effects++;
          return late.promise;
        },
        within: async () => {
          throw Error("fixture-deadline");
        },
      });
      late.resolve({ alias: A, value: "PRIVATE_LATE" });
      await late.promise;
      expect(result).toEqual({ evidence: "FIXTURE_ONLY", outcome: "DISCARDED" });
      expect(effects).toBe(1);
      expect(t.calls).toEqual(operation === "qr.poll" ? [A] : []);
    },
  );
  it("MP3-14 equal A-B-A snapshots demonstrate the remaining epoch blind spot", async () => {
    const t = harness(),
      initial = structuredClone(t.rows),
      q = deferred<{ alias: string; value: string }>();
    const pending = t.run(A, "status", { work: () => q.promise });
    t.rows[0]!.fixtureAccount = "B-between-samples";
    t.rows.splice(0, 2, ...initial);
    q.resolve({ alias: A, value: "A-only" });
    expect(await pending).toMatchObject({ outcome: "PUBLISHED" });
    // A limitation witness, not a successful live identity test.
    expect(inspectFixtureTopology(t.rows).nativeEngineeringDecision).toBe("UNKNOWN");
  });
});
