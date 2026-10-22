import { afterEach, describe, expect, it } from "vitest";
import { OfflineProfilePrototype } from "../src/bridge/profiles/prototype.js";
import type { Outcome } from "../src/bridge/profiles/prototype.js";
import { OfflineProfileRegistry } from "../src/bridge/profiles/registry.js";
import type {
  ClockPort,
  Observation,
  ProfileLease,
  ProfileOperation,
  Registration,
  Scope,
  SourceEvidence,
  SyntheticPorts,
  SyntheticTarget,
} from "../src/bridge/profiles/types.js";
import {
  assertOperationAllowedForContext,
  assertRemoteAdminControlRequest,
  authenticateRequestContext,
} from "../src/bridge/policy/request-context.js";
import { getBridgeOperation, listBridgeOperations } from "../src/bridge/policy/registry.js";

const A = `p_${"a".repeat(32)}`,
  B = `p_${"b".repeat(32)}`,
  C = `p_${"c".repeat(32)}`;
const OPERATIONS: ProfileOperation[] = ["qr.begin", "qr.poll", "session.status", "lookup"];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
class FakeClock implements ClockPort {
  time = 100;
  timers = new Map<object, { deadline: number; reject: (error: Error) => void }>();
  now() {
    return this.time;
  }
  async within<T>(work: Promise<T>, deadline: number): Promise<T> {
    const key = {};
    const timeout = new Promise<never>((_resolve, reject) => {
      this.timers.set(key, { deadline, reject });
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      this.timers.delete(key);
    }
  }
  advance(ms: number) {
    this.time += ms;
    for (const timer of this.timers.values())
      if (timer.deadline <= this.time) timer.reject(new Error("deadline"));
  }
}
const processEvidence = {
  pid: 100,
  created: "private-parent-created-1",
  path: "private-fixture-path",
  artifact: "private-exact-artifact",
  endpoint: "fixed-loopback" as const,
  contracts: {
    "qr.begin": "private-qr-begin-contract",
    "qr.poll": "private-qr-poll-contract",
    "session.status": "private-status-contract",
    lookup: "private-lookup-contract",
  },
};
function source(letter: string, number: number, connected = true): SourceEvidence {
  return {
    id: `private-source-${letter}`,
    number,
    provider: "synthetic",
    worker: { pid: 100 + number, created: `private-worker-${letter}`, restarts: 0, ready: true },
    account: {
      token: connected ? `private-account-${letter}` : null,
      display: "masked***",
      kind: "synthetic",
      connected,
      savedLogin: false,
      l2: "available",
      epoch: null,
    },
  };
}
function registration(alias: string, s: SourceEvidence): Registration {
  return {
    alias,
    revision: 1,
    enabled: true,
    expectedAccount: `private-account-${s.number === 1 ? "a" : "b"}`,
    process: structuredClone(processEvidence),
    source: structuredClone(s),
  };
}
type Mutable<T> = { -readonly [P in keyof T]: T[P] extends object ? Mutable<T[P]> : T[P] };
interface Counts {
  observe: number;
  begin: number;
  poll: number;
  status: number;
  lookup: number;
}
const fixtures: ReturnType<typeof makeFixture>[] = [];
function makeFixture(
  options: {
    disconnectedA?: boolean;
    disconnectedB?: boolean;
    defaultAlias?: string;
    bootNonce?: string;
  } = {},
) {
  const clock = new FakeClock();
  const observed = structuredClone({
    process: processEvidence,
    sources: [source("a", 1, !options.disconnectedA), source("b", 2, !options.disconnectedB)],
  }) as Mutable<Observation>;
  const rows = [registration(A, observed.sources[0]!), registration(B, observed.sources[1]!)];
  const counts: Counts = { observe: 0, begin: 0, poll: 0, status: 0, lookup: 0 };
  const scopes = new Map<object, Scope>();
  let revision = 1,
    sequence = 0;
  const authority = {};
  scopes.set(authority, {
    context: "local",
    principal: "operator-a",
    audience: "fixture-audience",
    deployment: "fixture-deployment",
    policyRevision: 1,
  });
  const grants = new Set([A, B].flatMap((alias) => OPERATIONS.map((op) => `${alias}:${op}`)));
  const targets: { operation: string; target: SyntheticTarget }[] = [];
  const impl = {
    observe: async (): Promise<unknown> => structuredClone(observed),
    begin: async (_target: SyntheticTarget): Promise<unknown> => ({ flowId: 7, qr: "fixture-qr" }),
    poll: async (_target: SyntheticTarget, _id: number): Promise<unknown> => ({ state: "waiting" }),
    status: async (target: SyntheticTarget): Promise<unknown> => ({
      state: target.source.account.connected ? "connected" : "login_required",
    }),
    lookup: async (target: SyntheticTarget, code: string): Promise<unknown> => ({
      items: [
        {
          code,
          name: target.source.id.endsWith("a") ? "instrument-a" : "instrument-b",
          market: "FIXTURE",
        },
      ],
    }),
  };
  const ports: SyntheticPorts = {
    observe: () => {
      counts.observe++;
      return impl.observe();
    },
    begin: (target) => {
      counts.begin++;
      targets.push({ operation: "qr.begin", target });
      return impl.begin(target);
    },
    poll: (target, id) => {
      counts.poll++;
      targets.push({ operation: "qr.poll", target });
      return impl.poll(target, id);
    },
    status: (target) => {
      counts.status++;
      targets.push({ operation: "session.status", target });
      return impl.status(target);
    },
    lookup: (target, code) => {
      counts.lookup++;
      targets.push({ operation: "lookup", target });
      return impl.lookup(target, code);
    },
  };
  const uuid = {
    next: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`,
  };
  const bootNonce = options.bootNonce ?? "1".repeat(32);
  const prototype = new OfflineProfilePrototype({
    registrations: {
      registrations: rows,
      ...(options.defaultAlias ? { defaultAlias: options.defaultAlias } : {}),
    },
    clock,
    authority: {
      verify: (token) => {
        const s = scopes.get(token);
        return s ? { ...s, policyRevision: revision } : undefined;
      },
      allows: (_scope, alias, operation) => grants.has(`${alias}:${operation}`),
    },
    bootNonce,
    uuid: () => uuid.next(),
    ports,
  });
  const outcomes: Outcome[] = [];
  async function run(
    operation: ProfileOperation,
    alias: string | null = A,
    extra: Record<string, unknown> = {},
  ): Promise<Outcome> {
    const result = await prototype.execute({
      operation,
      authority,
      ...(alias ? { alias } : {}),
      ...(operation === "lookup" ? { code: "600000" } : {}),
      ...extra,
    });
    outcomes.push(result);
    return result;
  }
  const f = {
    prototype,
    rows,
    observed,
    clock,
    counts,
    impl,
    scopes,
    authority,
    grants,
    targets,
    uuid,
    run,
    outcomes,
    policyChange: () => {
      revision++;
    },
    newAuthority: (patch: Partial<Scope>) => {
      const token = {};
      scopes.set(token, { ...scopes.get(authority)!, ...patch });
      return token;
    },
  };
  return f;
}
function fixture(options: Parameters<typeof makeFixture>[0] = {}) {
  const f = makeFixture(options);
  fixtures.push(f);
  return f;
}
function fail(result: Outcome, code: string) {
  expect(result).toEqual({ ok: false, code });
}
function value(result: Outcome): Readonly<Record<string, unknown>> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.value;
}
function noEffects(f: ReturnType<typeof fixture>, reads = 0) {
  expect(f.counts).toEqual({ observe: reads, begin: 0, poll: 0, status: 0, lookup: 0 });
}
function hold(f: ReturnType<typeof fixture>, operation: "begin" | "poll" | "status" | "lookup") {
  const entered = deferred<void>(),
    done = deferred<unknown>();
  f.impl[operation] = async () => {
    entered.resolve();
    return done.promise;
  };
  return { entered: entered.promise, release: done.resolve };
}
afterEach((context) => {
  const evidence = fixtures.splice(0).map((f) => {
    const stats = f.prototype.stats();
    expect(stats.active).toBeLessThanOrEqual(1);
    expect(stats.tombstones).toBeLessThanOrEqual(16);
    expect(stats.issued).toBeLessThanOrEqual(256);
    expect(stats.inflight).toBe(0);
    expect(stats.pending).toBe(0);
    expect(f.clock.timers.size).toBe(0);
    expect(f.prototype.registry.count).toBeLessThanOrEqual(16);
    for (const outcome of f.outcomes) {
      expect(JSON.stringify(outcome)).not.toMatch(
        /private-|account_display|raw-foreign|nativeId|bootNonce/,
      );
      if (!outcome.ok) expect(Object.keys(outcome).sort()).toEqual(["code", "ok"]);
    }
    return {
      outcomes: f.outcomes.map((o) => (o.ok ? "OK" : o.code)),
      calls: f.counts,
      resources: stats,
    };
  });
  console.info(
    JSON.stringify({ case: context.task.name.slice(0, 6), synthetic: true, realIO: 0, evidence }),
  );
});

describe("MP-1 offline profile isolation (not live qualification)", () => {
  it("MP1-01 shared resolver binds QR/status/lookup to A with opaque operation leases", async () => {
    const f = fixture({ disconnectedB: true });
    const begin = value(await f.run("qr.begin"));
    value(await f.run("qr.poll", A, { sessionId: begin.sessionId }));
    expect(value(await f.run("session.status"))).toEqual({ state: "connected" });
    expect(value(await f.run("lookup"))).toEqual({
      items: [{ code: "600000", name: "instrument-a", market: "FIXTURE" }],
    });
    expect(f.counts).toEqual({ observe: 12, begin: 1, poll: 1, status: 1, lookup: 1 });
    expect(f.targets.map((t) => t.operation)).toEqual(OPERATIONS);
    for (const { target } of f.targets) {
      expect(target.source).toEqual(f.rows[0]!.source);
      expect(Object.isFrozen(target.source.account)).toBe(true);
      expect(JSON.stringify(target.lease)).toBe("{}");
    }
    await expect(f.prototype.resolver.validate({} as ProfileLease)).rejects.toMatchObject({
      code: "PROFILE_DENIED",
    });
    const lease = await f.prototype.resolver.resolve({
      alias: A,
      operation: "lookup",
      authority: f.authority,
    });
    expect(() =>
      f.prototype.resolver.effect(lease, "qr.begin", () => {
        throw new Error("must not run");
      }),
    ).toThrow("PROFILE_DENIED");
    // Caller changes to the original registration object cannot change its immutable snapshot.
    (f.rows[0] as Mutable<Registration>).source.id = "private-mutated";
    value(await f.run("lookup"));
  });
  it("MP1-02 missing alias never infers a connected default", async () => {
    const f = fixture();
    for (const op of OPERATIONS.filter((op) => op !== "qr.poll"))
      fail(await f.run(op, null), "PROFILE_SELECTION_REQUIRED");
    noEffects(f);
  });
  it("MP1-03 unknown and forbidden aliases are indistinguishable without reads", async () => {
    const f = fixture();
    f.grants.delete(`${A}:lookup`);
    expect(await f.run("lookup", C)).toEqual(await f.run("lookup", A));
    fail(await f.run("lookup", C), "PROFILE_DENIED");
    fail(await f.run("lookup", A, { authority: { ...f.authority } }), "PROFILE_DENIED");
    noEffects(f);
  });
  it("MP1-04 invalid registrations, duplicate/default/pin conflicts and max 16", () => {
    const f = fixture(),
      a = f.rows[0]!,
      b = f.rows[1]!;
    const invalid = [
      { registrations: [a, a] },
      { registrations: [a, { ...b, source: a.source }] },
      { registrations: [a, { ...b, expectedAccount: a.expectedAccount }] },
      { registrations: [a], defaultAlias: B },
      { registrations: [a], defaultAlias: A, legacyQrPin: 2 },
      { registrations: [a], legacyQrPin: 1 },
      { registrations: [a], defaults: [A, B] },
      { registrations: [{ ...a, url: "http://127.0.0.1:17281" }] },
      {
        registrations: [
          {
            ...a,
            enabled: true,
            source: { ...a.source, account: { ...a.source.account, token: null } },
          },
        ],
      },
    ];
    for (const config of invalid)
      expect(() => new OfflineProfileRegistry(config)).toThrow("CONFIG_INVALID");
    const rows = Array.from({ length: 16 }, (_, i) => {
      const s = source(`fixture-${i}`, i + 1);
      return {
        ...a,
        alias: `p_${i.toString(16).padStart(32, "0")}`,
        expectedAccount: s.account.token!,
        source: s,
      };
    });
    expect(new OfflineProfileRegistry({ registrations: rows }).count).toBe(16);
    expect(() => new OfflineProfileRegistry({ registrations: [...rows, b] })).toThrow(
      "CONFIG_INVALID",
    );
    noEffects(f);
  });
  it("MP1-05 disconnected A never falls back to connected B or begins QR", async () => {
    const f = fixture({ disconnectedA: true });
    fail(await f.run("lookup"), "LOGIN_REQUIRED");
    expect(value(await f.run("session.status"))).toEqual({ state: "login_required" });
    fail(await f.run("qr.begin"), "PROFILE_UNAVAILABLE");
    expect(f.counts).toEqual({ observe: 5, begin: 0, poll: 0, status: 1, lookup: 0 });
    expect(f.targets.every((t) => t.target.source.id.endsWith("a"))).toBe(true);
  });
  it("MP1-06 URL/port/native selectors, extra fields and malformed input have no effects", async () => {
    const f = fixture();
    for (const alias of [
      "http://127.0.0.1:17281",
      "17281",
      "private-source-a",
      A.toUpperCase(),
      `${A}x`,
    ])
      fail(await f.run("lookup", alias), "INPUT_INVALID");
    for (const extra of [
      { sourceId: "private-source-b" },
      { port: 17281 },
      { url: "http://fixture.invalid" },
      { account: "raw-foreign" },
      { code: "600000*" },
      { sessionId: "x" },
    ])
      fail(await f.run("lookup", A, extra), "INPUT_INVALID");
    noEffects(f);
  });
  it("MP1-07 cross-alias/principal/audience polling cannot mutate active or terminal flows", async () => {
    const f = fixture({ disconnectedB: true });
    const begin = value(await f.run("qr.begin"));
    const others = [
      f.newAuthority({ principal: "operator-b" }),
      f.newAuthority({ audience: "other-audience" }),
      f.newAuthority({ deployment: "other-deployment" }),
    ];
    for (const authority of others)
      fail(await f.run("qr.poll", A, { sessionId: begin.sessionId, authority }), "QR_FLOW_INVALID");
    // B is denied by the conservative peer guard before any native authentication.
    fail(await f.run("qr.poll", B, { sessionId: begin.sessionId }), "PROFILE_UNAVAILABLE");
    expect(f.prototype.stats().active).toBe(1);
    f.impl.poll = async () => ({ state: "connected" });
    value(await f.run("qr.poll", A, { sessionId: begin.sessionId }));
    for (const authority of others)
      fail(await f.run("qr.poll", A, { sessionId: begin.sessionId, authority }), "QR_FLOW_INVALID");
    value(await f.run("qr.poll", A, { sessionId: begin.sessionId }));
    expect(f.counts.begin).toBe(1);
    expect(f.counts.poll).toBe(1);
    const g = fixture({ disconnectedA: true, disconnectedB: true });
    const own = value(await g.run("qr.begin"));
    fail(await g.run("qr.poll", B, { sessionId: own.sessionId }), "QR_FLOW_INVALID");
    expect(g.prototype.stats().active).toBe(1);
    g.clock.advance(120_000);
    fail(await g.run("qr.poll", B, { sessionId: own.sessionId }), "QR_FLOW_INVALID");
    fail(await g.run("qr.poll", A, { sessionId: own.sessionId }), "QR_FLOW_EXPIRED");
    expect(g.counts.poll).toBe(0);
  });
  it("MP1-08 native flow reuse never resurrects UUIDs, including evicted tombstones", async () => {
    const f = fixture({ disconnectedB: true });
    const first = value(await f.run("qr.begin"));
    const second = value(await f.run("qr.begin"));
    expect(first.sessionId).not.toBe(second.sessionId);
    fail(await f.run("qr.poll", A, { sessionId: first.sessionId }), "QR_FLOW_REPLACED");
    f.clock.advance(150_001);
    f.prototype.stats();
    const before = f.counts.begin;
    f.uuid.next = () => "00000000-0000-4000-8000-000000000001";
    fail(await f.run("qr.begin"), "QR_FLOW_LIMIT");
    expect(f.counts.begin).toBe(before);
    expect(f.counts.poll).toBe(0);
  });
  it("MP1-09 remove/disable/re-enroll while lookup or poll is pending fences results", async () => {
    for (const change of ["remove", "disable", "reenroll"] as const) {
      const f = fixture();
      const h = hold(f, "lookup");
      const work = f.run("lookup");
      await h.entered;
      if (change === "reenroll") f.prototype.registry.reenroll({ ...f.rows[0], revision: 2 });
      else f.prototype.registry[change](A);
      h.release({ items: [{ code: "600000", name: "instrument-a", market: "FIXTURE" }] });
      fail(await work, "PROFILE_STALE");
      f.impl.lookup = async () => ({
        items: [{ code: "600000", name: "instrument-b", market: "FIXTURE" }],
      });
      expect(value(await f.run("lookup", B)).items).toEqual([
        { code: "600000", name: "instrument-b", market: "FIXTURE" },
      ]);
      expect(f.counts.lookup).toBe(2);
      expect(f.counts.begin + f.counts.poll).toBe(0);
    }
    const f = fixture({ disconnectedB: true });
    const begin = value(await f.run("qr.begin"));
    const h = hold(f, "poll"),
      work = f.run("qr.poll", A, { sessionId: begin.sessionId });
    await h.entered;
    f.prototype.registry.remove(A);
    h.release({ state: "connected" });
    fail(await work, "PROFILE_STALE");
    expect(f.prototype.stats().active).toBe(0);
    expect(f.counts.poll).toBe(1);
  });
  it("MP1-10 source removal, ID reuse, renumbering, provider and worker changes suspend A", async () => {
    for (const change of ["removed", "id", "number", "provider", "worker"] as const) {
      const f = fixture(),
        h = hold(f, "lookup"),
        work = f.run("lookup");
      await h.entered;
      if (change === "removed") f.observed.sources.shift();
      else if (change === "id") f.observed.sources[0]!.id = "private-reused";
      else if (change === "number") f.observed.sources[0]!.number = 3;
      else if (change === "provider")
        (f.observed.sources[0] as unknown as { provider: string }).provider = "other";
      else f.observed.sources[0]!.worker.created = "private-worker-reused";
      h.release({ items: [] });
      fail(
        await work,
        ["removed", "id", "provider"].includes(change) ? "PROFILE_UNAVAILABLE" : "PROFILE_STALE",
      );
      expect(f.prototype.registry.get(A)?.enabled).toBe(false);
      expect(f.counts.lookup).toBe(1);
    }
  });
  it("MP1-11 parent PID reuse and worker restarts fence matching leases and flows", async () => {
    for (const change of ["parent", "worker", "restart", "not-ready"] as const) {
      const f = fixture({ disconnectedB: true }),
        begin = value(await f.run("qr.begin"));
      if (change === "parent") f.observed.process.created = "private-parent-created-2";
      else if (change === "worker") f.observed.sources[0]!.worker.pid++;
      else if (change === "restart") f.observed.sources[0]!.worker.restarts++;
      else f.observed.sources[0]!.worker.ready = false;
      fail(await f.run("qr.poll", A, { sessionId: begin.sessionId }), "PROFILE_STALE");
      expect(f.prototype.stats().active).toBe(0);
      expect(f.counts.poll).toBe(0);
      if (change === "parent") expect(f.prototype.registry.get(B)?.enabled).toBe(false);
    }
  });
  it("MP1-12 account switch at unchanged source/PID suppresses successful old lookup", async () => {
    const f = fixture(),
      h = hold(f, "lookup"),
      work = f.run("lookup");
    await h.entered;
    f.observed.sources[0]!.account.token = "private-account-c";
    h.release({ items: [{ code: "600000", name: "raw-foreign", market: "FIXTURE" }] });
    fail(await work, "PROFILE_STALE");
    fail(await f.run("lookup"), "PROFILE_DENIED");
    expect(f.counts.lookup).toBe(1);
    expect(f.prototype.registry.get(A)?.enabled).toBe(false);
  });
  it("MP1-13 missing strong identity and duplicate accounts deny despite equal masked displays", async () => {
    for (const token of [null, "private-account-b"]) {
      const f = fixture();
      f.observed.sources[0]!.account.token = token;
      fail(await f.run("lookup"), "IDENTITY_UNPROVEN");
      noEffects(f, 1);
    }
    const f = fixture();
    // Equal display is permitted only because DIFFERENT synthetic strong proofs exist.
    expect(f.observed.sources[0]!.account.display).toBe(f.observed.sources[1]!.account.display);
    value(await f.run("lookup"));
    value(await f.run("lookup", B));
    expect(f.counts.lookup).toBe(2);
  });
  it("MP1-14 unobserved A-B-A without native epoch is explicitly unprovable", async () => {
    const f = fixture(),
      h = hold(f, "lookup"),
      work = f.run("lookup");
    await h.entered;
    f.observed.sources[0]!.account.token = "private-account-c";
    f.observed.sources[0]!.account.token = "private-account-a";
    h.release({ items: [] });
    value(await work);
    expect(f.prototype.resolver.epochGuarantee()).toBe("LIVE_SESSION_EPOCH_UNPROVEN");
    expect(f.counts.lookup).toBe(1);
    const g = fixture();
    g.observed.sources[0]!.account.epoch = "private-native-epoch-2";
    fail(await g.run("lookup"), "PROFILE_STALE");
    noEffects(g, 1);
  });
  it("MP1-15 saved-login/L2/disconnect changes invalidate results without repair", async () => {
    for (const change of ["savedLogin", "l2", "disconnect"] as const) {
      const f = fixture(),
        h = hold(f, "lookup"),
        work = f.run("lookup");
      await h.entered;
      const a = f.observed.sources[0]!.account;
      if (change === "savedLogin") a.savedLogin = true;
      else if (change === "l2") a.l2 = "level2_replaced_by_remote_login";
      else a.connected = false;
      h.release({ items: [] });
      fail(await work, "PROFILE_STALE");
      expect(f.counts.lookup).toBe(1);
      expect(f.counts.begin + f.counts.poll).toBe(0);
    }
  });
  it("MP1-16 overlapping A/B begin and begin/poll have one global POST at most", async () => {
    const f = fixture({ disconnectedA: true, disconnectedB: true }),
      h = hold(f, "begin"),
      work = f.run("qr.begin");
    await h.entered;
    fail(await f.run("qr.begin", B), "QR_FLOW_LIMIT");
    fail(await f.run("qr.begin"), "QR_FLOW_LIMIT");
    h.release({ flowId: 7, qr: "fixture-qr" });
    const begin = value(await work);
    const poll = hold(f, "poll"),
      polling = f.run("qr.poll", A, { sessionId: begin.sessionId });
    await poll.entered;
    fail(await f.run("qr.begin", B), "QR_FLOW_LIMIT");
    poll.release({ state: "waiting" });
    value(await polling);
    fail(await f.run("qr.begin", B), "QR_FLOW_LIMIT");
    expect(f.counts.begin).toBe(1);
    expect(f.counts.poll).toBe(1);
    // A deadline stops publication, but an unsettled auth port still holds the global mutex.
    const g = fixture({ disconnectedA: true, disconnectedB: true });
    const slow = hold(g, "begin"),
      timeout = g.run("qr.begin");
    await slow.entered;
    g.clock.advance(5_000);
    fail(await timeout, "TIMEOUT");
    expect(g.prototype.stats().pending).toBe(1);
    fail(await g.run("qr.begin", B), "QR_FLOW_LIMIT");
    expect(g.counts.begin).toBe(1);
    slow.release({ flowId: 7, qr: "fixture-qr" });
    value(await g.run("session.status", B));
    expect(g.prototype.stats().active).toBe(0);
  });
  it("MP1-17 selection cancellation/unmount hides late poll and late begin without revoke", async () => {
    const f = fixture({ disconnectedB: true }),
      view = f.prototype.createView();
    const begin = value(await f.run("qr.begin", A, { view }));
    const h = hold(f, "poll"),
      work = f.run("qr.poll", A, { sessionId: begin.sessionId, view });
    await h.entered;
    f.prototype.cancel(view);
    h.release({ state: "connected" });
    fail(await work, "PROFILE_STALE");
    expect(f.prototype.stats().active).toBe(0);
    expect(f.counts.poll).toBe(1);
    expect(value(await f.run("session.status", B))).toEqual({ state: "login_required" });
    const g = fixture({ disconnectedB: true }),
      v = g.prototype.createView(),
      b = hold(g, "begin"),
      w = g.run("qr.begin", A, { view: v });
    await b.entered;
    g.prototype.cancel(v);
    b.release({ flowId: 7, qr: "fixture-qr" });
    fail(await w, "PROFILE_STALE");
    expect(g.prototype.stats().active).toBe(0);
    expect(g.counts.begin).toBe(1);
  });
  it("MP1-18 same-code A/B lookups finish in reverse order without cache/dedup", async () => {
    const f = fixture(),
      a = deferred<unknown>(),
      b = deferred<unknown>(),
      enteredA = deferred<void>(),
      enteredB = deferred<void>();
    f.impl.lookup = async (target) => {
      if (target.source.id.endsWith("a")) {
        enteredA.resolve();
        return a.promise;
      }
      enteredB.resolve();
      return b.promise;
    };
    const wa = f.run("lookup"),
      wb = f.run("lookup", B);
    await Promise.all([enteredA.promise, enteredB.promise]);
    b.resolve({ items: [{ code: "600000", name: "instrument-b", market: "FIXTURE" }] });
    expect(value(await wb).items).toEqual([
      { code: "600000", name: "instrument-b", market: "FIXTURE" },
    ]);
    a.resolve({ items: [{ code: "600000", name: "instrument-a", market: "FIXTURE" }] });
    expect(value(await wa).items).toEqual([
      { code: "600000", name: "instrument-a", market: "FIXTURE" },
    ]);
    value(await f.run("lookup"));
    expect(f.counts.lookup).toBe(3);
    expect(f.counts.observe).toBe(9);
  });
  it("MP1-19 registration/grant/policy changes fence both observation and final commit", async () => {
    for (const change of ["registration", "policy", "grant"]) {
      const f = fixture(),
        h = hold(f, "lookup"),
        work = f.run("lookup");
      await h.entered;
      if (change === "registration") f.prototype.registry.reenroll({ ...f.rows[0], revision: 2 });
      else if (change === "policy") f.policyChange();
      else f.grants.delete(`${A}:lookup`);
      h.release({ items: [] });
      fail(await work, "PROFILE_STALE");
      expect(f.counts.lookup).toBe(1);
    }
    const f = fixture(),
      entered = deferred<void>(),
      done = deferred<unknown>();
    f.impl.observe = async () => {
      entered.resolve();
      return done.promise;
    };
    const work = f.run("lookup");
    await entered.promise;
    f.policyChange();
    done.resolve(structuredClone(f.observed));
    fail(await work, "PROFILE_STALE");
    noEffects(f, 1);
    const g = fixture();
    const lease = await g.prototype.resolver.resolve({
      alias: A,
      operation: "lookup",
      authority: g.authority,
    });
    await g.prototype.resolver.validate(lease);
    g.policyChange();
    let publications = 0;
    expect(() => g.prototype.resolver.commit(lease, () => publications++)).toThrow("PROFILE_STALE");
    expect(publications).toBe(0);
    noEffects(g, 2);
  });
  it("MP1-20 failed replacement/expiry cannot revive a flow; tombstones and allocations bounded", async () => {
    const f = fixture({ disconnectedB: true }),
      first = value(await f.run("qr.begin"));
    f.impl.begin = async () => {
      throw new Error("raw-foreign authentication may already have run");
    };
    fail(await f.run("qr.begin"), "PROFILE_UNAVAILABLE");
    fail(await f.run("qr.poll", A, { sessionId: first.sessionId }), "QR_FLOW_REPLACED");
    expect(f.counts.poll).toBe(0);
    f.impl.begin = async () => ({ flowId: 7, qr: "fixture-qr" });
    const second = value(await f.run("qr.begin"));
    f.clock.advance(119_999);
    value(await f.run("qr.poll", A, { sessionId: second.sessionId }));
    f.clock.advance(1);
    fail(await f.run("qr.poll", A, { sessionId: second.sessionId }), "QR_FLOW_EXPIRED");
    expect(f.counts.poll).toBe(1);
    for (let i = f.prototype.stats().issued; i < 256; i++) value(await f.run("qr.begin"));
    expect(f.prototype.stats()).toMatchObject({ active: 1, tombstones: 16, issued: 256 });
    const count = f.counts.begin;
    fail(await f.run("qr.begin"), "RESOURCE_LIMIT");
    expect(f.counts.begin).toBe(count);
    f.clock.advance(150_001);
    expect(f.prototype.stats()).toMatchObject({ active: 0, tombstones: 1, issued: 256 });
    f.clock.advance(30_000);
    expect(f.prototype.stats()).toMatchObject({ active: 0, tombstones: 0, issued: 256 });
  });
  it("MP1-21 raw upstream errors and unexpected fields never appear in public outcomes", async () => {
    const f = fixture();
    f.impl.lookup = async () => {
      throw new Error("raw-foreign private-source-b private-account-b qr=secret cookie=secret");
    };
    fail(await f.run("lookup"), "PROFILE_UNAVAILABLE");
    f.impl.lookup = async () => ({ items: [], raw: "raw-foreign" });
    fail(await f.run("lookup"), "UPSTREAM_INVALID");
    expect(f.counts.lookup).toBe(2);
    expect(f.counts.begin).toBe(0);
  });
  it("MP1-22 all remote aliases denied before reads; production context allowlists stay exact", async () => {
    const f = fixture();
    for (const context of ["remote_machine", "remote_human", "remote_admin"] as const) {
      const authority = f.newAuthority({ context });
      for (const op of OPERATIONS)
        fail(
          await f.run(op, A, {
            authority,
            ...(op === "qr.poll" ? { sessionId: "00000000-0000-4000-8000-000000000001" } : {}),
          }),
          "PROFILE_DENIED",
        );
    }
    fail(
      await f.prototype.execute({ operation: "profiles.create", authority: f.authority, alias: A }),
      "INPUT_INVALID",
    );
    expect(
      listBridgeOperations()
        .filter((op) => op.allowedContexts.includes("remote_machine"))
        .map((op) => op.id)
        .sort(),
    ).toEqual(["market.instruments.lookup", "openapi.machine"]);
    for (const context of ["remote_human", "remote_admin"] as const)
      expect(() =>
        assertOperationAllowedForContext(getBridgeOperation("market.instruments.lookup"), context),
      ).toThrow();
    noEffects(f);
  });
  it("MP1-23 existing Host/JWT/Origin/intent gate denies before offline resolution", async () => {
    const f = fixture();
    let entered = 0;
    const options = {
      adminHostname: "admin.example.invalid",
      adminVerifier: {
        audience: "admin-aud",
        verify: async (assertion: string) => {
          if (assertion === "bad-signature") throw new Error("raw-foreign");
          return { kind: "human" as const, subject: "fixture", audience: "wrong-aud" };
        },
      },
    };
    for (const headers of [
      { host: "unknown.example.invalid", "x-forwarded-host": "127.0.0.1:17282" },
      { host: "admin.example.invalid", "cf-access-jwt-assertion": "bad-signature" },
      { host: "admin.example.invalid", "cf-access-jwt-assertion": "wrong-aud" },
    ]) {
      await expect(
        (async () => {
          await authenticateRequestContext(
            new Request("https://unknown.example.invalid", { headers }),
            options,
          );
          entered++;
        })(),
      ).rejects.toThrow();
    }
    for (const headers of [
      { origin: "https://foreign.example.invalid" },
      { origin: "https://admin.example.invalid" },
      { origin: "https://admin.example.invalid", "x-bridge-admin-intent": "wrong" },
    ]) {
      expect(() => {
        assertRemoteAdminControlRequest(
          new Request("https://admin.example.invalid", { method: "POST", headers }),
          options,
        );
        entered++;
      }).toThrow();
    }
    expect(entered).toBe(0);
    noEffects(f);
  });
  it("MP1-24 explicit legacy default is shared; no configuration means no guessed profile", async () => {
    const f = fixture({ defaultAlias: A, disconnectedB: true });
    for (const operation of ["lookup", "session.status"] as const)
      value(await f.run(operation, null));
    const begin = value(await f.run("qr.begin", null));
    value(await f.run("qr.poll", null, { sessionId: begin.sessionId }));
    expect(f.targets.every((t) => t.target.source.id === f.rows[0]!.source.id)).toBe(true);
    const empty = new OfflineProfileRegistry({ registrations: [] });
    expect(empty.defaultAlias).toBeUndefined();
    expect(
      new OfflineProfileRegistry({ registrations: f.rows, defaultAlias: A, legacyQrPin: 1 })
        .defaultAlias,
    ).toBe(A);
    expect(f.counts).toEqual({ observe: 12, lookup: 1, status: 1, begin: 1, poll: 1 });
    // Production v1/no-registry/two-connected v2 remain exercised by the unchanged baseline suites.
  });
  it("MP1-25 artifact/contracts/inventory/response/time/inflight bounds fail without retry", async () => {
    for (const change of ["artifact", "contract", "inventory", "response"]) {
      const f = fixture();
      if (change === "artifact") f.observed.process.artifact = "private-other-artifact";
      if (change === "contract") f.observed.process.contracts.lookup = "private-other-contract";
      if (change === "inventory")
        f.observed.sources = Array.from({ length: 17 }, (_, i) =>
          structuredClone(source(`overflow-${i}`, i + 1)),
        );
      if (change === "response")
        f.impl.lookup = async () => ({
          items: Array.from({ length: 17 }, () => ({
            code: "600000",
            name: "x",
            market: "FIXTURE",
          })),
        });
      fail(
        await f.run("lookup"),
        ["artifact", "contract"].includes(change)
          ? "PROFILE_STALE"
          : change === "inventory"
            ? "PROFILE_UNAVAILABLE"
            : "UPSTREAM_INVALID",
      );
      expect(f.counts.lookup).toBe(change === "response" ? 1 : 0);
      expect(f.counts.observe).toBe(change === "response" ? 3 : 1);
    }
    const f = fixture(),
      h = hold(f, "lookup"),
      work = f.run("lookup");
    await h.entered;
    f.clock.advance(5_000);
    fail(await work, "TIMEOUT");
    h.release({ items: [] });
    expect(f.counts.lookup).toBe(1);
    const g = fixture(),
      barrier = deferred<unknown>(),
      entered = deferred<void>();
    let count = 0;
    g.impl.observe = async () => {
      if (++count === 32) entered.resolve();
      return barrier.promise;
    };
    const pending = Array.from({ length: 32 }, () => g.run("lookup"));
    await entered.promise;
    fail(await g.run("lookup"), "RESOURCE_LIMIT");
    barrier.resolve(structuredClone(g.observed));
    for (const result of await Promise.all(pending)) value(result);
    expect(g.counts.lookup).toBe(32);
    const unresolved = fixture(),
      raw = deferred<unknown>(),
      allStarted = deferred<void>();
    let started = 0;
    unresolved.impl.lookup = () => {
      if (++started === 32) allStarted.resolve();
      return raw.promise;
    };
    const late = Array.from({ length: 32 }, () => unresolved.run("lookup"));
    await allStarted.promise;
    unresolved.clock.advance(5_000);
    for (const result of await Promise.all(late)) fail(result, "TIMEOUT");
    expect(unresolved.prototype.stats().pending).toBe(32);
    const reads = unresolved.counts.observe;
    fail(await unresolved.run("session.status", B), "PROFILE_UNAVAILABLE");
    expect(unresolved.counts.observe).toBe(reads);
    expect(unresolved.counts.lookup).toBe(32);
    expect(unresolved.counts.status).toBe(0);
    raw.resolve({ items: [] });
    await raw.promise;
    expect(unresolved.prototype.stats().pending).toBe(0);
  });
  it("MP1-26 a new boot rejects old opaque leases and UUIDs with no restored authority", async () => {
    const f = fixture({ disconnectedB: true }),
      begin = value(await f.run("qr.begin"));
    const lease = await f.prototype.resolver.resolve({
      alias: A,
      operation: "lookup",
      authority: f.authority,
    });
    const g = fixture({ disconnectedB: true, bootNonce: "2".repeat(32) });
    await expect(g.prototype.resolver.validate(lease)).rejects.toMatchObject({
      code: "PROFILE_DENIED",
    });
    fail(await g.run("qr.poll", A, { sessionId: begin.sessionId }), "QR_FLOW_INVALID");
    expect(g.counts.poll).toBe(0);
    expect(g.prototype.stats().issued).toBe(0);
    const fresh = value(await g.run("qr.begin"));
    expect(fresh.sessionId).not.toBe(begin.sessionId);
    fail(await g.run("qr.poll", A, { sessionId: begin.sessionId }), "QR_FLOW_INVALID");
    expect(g.counts.poll).toBe(0);
  });
  it("MP1-27 QR mutation fences pending peer lookup/status, even on begin failure", async () => {
    for (const operation of ["lookup", "status"] as const) {
      const f = fixture({ disconnectedB: operation === "status" }),
        h = hold(f, operation),
        work = f.run(operation === "status" ? "session.status" : "lookup", B);
      await h.entered;
      // Lookup starts with B connected. Simulate an external B disconnect before A's QR:
      // the conservative guard never authorizes auth while a peer is connected.
      if (operation === "lookup") f.observed.sources[1]!.account.connected = false;
      f.impl.begin = async () => {
        throw new Error("raw-foreign");
      };
      fail(await f.run("qr.begin"), "PROFILE_UNAVAILABLE");
      h.release(operation === "lookup" ? { items: [] } : { state: "login_required" });
      fail(await work, "PROFILE_STALE");
      expect(f.counts.begin).toBe(1);
      expect(f.counts[operation]).toBe(1);
      expect(f.counts.poll).toBe(0);
    }
  });
  it("MP1-28 disconnected QR completion stages unexpected account and never enables it", async () => {
    const f = fixture({ disconnectedA: true, disconnectedB: true }),
      begin = value(await f.run("qr.begin"));
    const h = hold(f, "poll"),
      work = f.run("qr.poll", A, { sessionId: begin.sessionId });
    await h.entered;
    f.observed.sources[0]!.account.connected = true;
    f.observed.sources[0]!.account.token = "private-unexpected-account";
    h.release({ state: "connected" });
    fail(await work, "ENROLLMENT_REQUIRED");
    fail(await f.run("lookup"), "PROFILE_DENIED");
    expect(f.prototype.registry.get(A)?.enabled).toBe(false);
    expect(f.prototype.stats().active).toBe(0);
    expect(f.counts).toEqual({ observe: 6, begin: 1, poll: 1, lookup: 0, status: 0 });
  });
});
