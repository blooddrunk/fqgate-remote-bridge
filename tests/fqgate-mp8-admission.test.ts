import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessCandidate,
  LOOKUP_CONTRACTS,
  REVIEW_CANDIDATES,
} from "../src/fqgate/admission/registry.js";
import { mp8Fixture } from "./helpers/mp8-fixture.js";

afterEach(() => vi.useRealTimers());
const query = { code: "600000" };
const mutable = (v: unknown) => v as Record<string, unknown>;
const searchCount = (f: ReturnType<typeof mp8Fixture>["f"]) =>
  f.reads.filter((p) => p.includes("search?")).length;
async function denied(h: ReturnType<typeof mp8Fixture>, beforeQuery = false) {
  const e = await h
    .make()
    .lookup(query)
    .catch((e) => e);
  expect(e).toMatchObject({
    code: "MP8_CANDIDATE_DENIED",
    message: "Offline lookup candidate prerequisites or continuity failed",
  });
  expect(String(e) + JSON.stringify(e)).not.toMatch(/PRIVATE_|secret|token|fixture-source/);
  expect(searchCount(h.f)).toBeLessThanOrEqual(1);
  if (beforeQuery) expect(searchCount(h.f)).toBe(0);
}

describe("MP8 exact version x operation offline admission", () => {
  it.each(["2.0.5", "2.0.6", "2.0.7"])(
    "models synthetic %s only, with zero production authority",
    async (version) => {
      const h = mp8Fixture(version);
      const d = assessCandidate([h.f.profile], h.f.attestation.observation);
      expect(d).toEqual({
        state: "OFFLINE_CANDIDATE",
        reason: "FIXTURE_ONLY",
        productionAllowed: false,
        runtimeQualified: false,
      });
      expect(await h.make().lookup(query)).toEqual({
        items: [{ code: "600000", market: "XSHG", name: "Fixture", instrumentId: "XSHG:600000" }],
      });
      expect(searchCount(h.f)).toBe(1);
      expect(
        h.ports.read.mock.calls.every(
          ([, o]) => o.method === "GET" && o.timeoutMs <= 5000 && o.timeoutMs > 0,
        ),
      ).toBe(true);
    },
  );
  it.each([
    "2.0.5",
    "2.0.6",
    "2.0.7",
    "2.0.8",
    "2.1.0",
    "3.0.0",
    "unknown",
    "latest",
    ">=2.0.5",
    "2.0.5-beta",
  ])("never admits real or unknown %s", async (version) => {
    const h = mp8Fixture(version);
    const d = assessCandidate(REVIEW_CANDIDATES, h.f.attestation.observation);
    expect(["UNKNOWN", "DENIED"]).toContain(d.state);
    await expect(h.make(REVIEW_CANDIDATES).lookup(query)).rejects.toHaveProperty(
      "code",
      "MP8_CANDIDATE_DENIED",
    );
    expect(h.ports.read).not.toHaveBeenCalled();
  });
  it.each([
    "session.qr.begin",
    "session.qr.poll",
    "bridge.status",
    "trading.orders",
    "account.write",
    "POST /v2/instruments/search",
  ])("no inherited qualification for %s", async (operation) => {
    const h = mp8Fixture();
    mutable(h.f.attestation.observation).operation = operation;
    await denied(h, true);
    expect(h.ports.read).not.toHaveBeenCalled();
  });
  it.each(["packageSha256", "executableSha256", "treeSha256", "clientSha256"])(
    "rejects %s mismatch or unknown before reads",
    async (key) => {
      for (const v of ["f".repeat(64), null, "", "secret"]) {
        const h = mp8Fixture();
        mutable(h.f.attestation.observation.artifacts)[key] = v;
        await denied(h, true);
        expect(h.ports.read).not.toHaveBeenCalled();
      }
    },
  );
  it.each([
    "parserRevision",
    "probeRevision",
    "identityPolicy",
    "platform",
    "architecture",
    "origin",
  ])("rejects %s drift", async (key) => {
    const h = mp8Fixture();
    mutable(h.f.attestation.observation)[key] = "changed";
    await denied(h, true);
  });
  it.each(["post", "trading"])("rejects %s method/path before any read", async (kind) => {
    const h = mp8Fixture();
    mutable(h.f.attestation.observation).contracts = [
      ...LOOKUP_CONTRACTS.slice(0, 4),
      kind === "post" ? ["/v2/instruments/search", "post"] : ["/v2/trading/orders", "get"],
    ];
    await denied(h, true);
    expect(h.ports.read).not.toHaveBeenCalled();
  });
  it.each(["publisherTrust", "nativeSourceLifetime", "hostOwnership", "localSemantics"])(
    "cannot promote missing %s",
    async (key) => {
      const h = mp8Fixture();
      mutable(h.f.profile.evidence)[key] = "UNVERIFIED";
      await denied(h, true);
    },
  );
  it("rejects duplicate profiles, missing pins and caller-selected Source", async () => {
    const h = mp8Fixture();
    await expect(h.make([h.f.profile, h.f.profile]).lookup(query)).rejects.toBeDefined();
    delete mutable(h.f.profile.artifacts).clientSha256;
    await denied(h, true);
    await expect(h.make().lookup({ ...query, instanceId: "secret" })).rejects.toBeDefined();
    expect(h.ports.read).not.toHaveBeenCalled();
  });
  it.each(["path", "method", "transitive", "external-ref", "missing-ref"])(
    "rejects contract %s drift before search",
    async (kind) => {
      const h = mp8Fixture();
      if (kind === "path") delete mutable(h.f.document.paths)[LOOKUP_CONTRACTS[4][0]];
      if (kind === "method") {
        const p = mutable(h.f.document.paths[LOOKUP_CONTRACTS[4][0]]);
        p.post = p.get;
        delete p.get;
      }
      if (kind === "transitive") h.f.document.components.schemas.Leaf.type = "number";
      if (kind === "external-ref")
        h.f.document.components.schemas.Root.properties.child.$ref =
          "https://secret.invalid/schema";
      if (kind === "missing-ref")
        h.f.document.components.schemas.Root.properties.child.$ref = "#/components/schemas/Missing";
      await denied(h, true);
    },
  );
  it("ignores unrelated OpenAPI operations and remains fixture-only", async () => {
    const h = mp8Fixture();
    mutable(h.f.document.paths)["/v2/trading/orders"] = { post: {} };
    expect((await h.make().lookup(query)).items).toHaveLength(1);
    expect(h.f.reads.some((p) => p.includes("trading"))).toBe(false);
  });
});

describe("MP8 sampled Source/Worker/account/process/protocol fences", () => {
  it.each(
    ["2.0.5", "2.0.6", "2.0.7"].flatMap((version) =>
      ["account", "ABA", "contract", "503", "deadline"].map((kind) => [version, kind]),
    ),
  )("repeats negative fences for synthetic %s / %s", async (version, kind) => {
    const h = mp8Fixture(version);
    h.f.beforeRead = (path) => {
      if (!path.includes("search?")) return;
      if (kind === "account")
        h.f.accounts.get("synthetic-a")!.snapshot.account_display = "PRIVATE_CHANGED";
      if (kind === "ABA") mutable(h.f.attestation.lifetimes[0]).generation = 2;
      if (kind === "contract") h.f.document.components.schemas.Leaf.type = "number";
      if (kind === "503") h.f.status = 503;
      if (kind === "deadline") h.f.time = 5000;
    };
    await denied(h);
  });
  it("P0 rejects pre/post account_display drift that production 2.0.5 returns", async () => {
    const h = mp8Fixture();
    h.f.beforeRead = (p) => {
      if (p.includes("search?"))
        h.f.accounts.get("synthetic-a")!.snapshot.account_display = "PRIVATE_CHANGED";
    };
    await denied(h);
    expect(searchCount(h.f)).toBe(1);
  });
  it.each([
    "source-ABA",
    "worker-created",
    "worker-PID",
    "parent",
    "process-created",
    "record",
    "state",
    "path",
    "version",
    "contract",
    "source-ID",
    "source-number",
    "restart",
    "disconnect",
    "saved",
    "L2",
    "kind",
    "peer",
  ])("discards on %s after query", async (kind) => {
    const h = mp8Fixture();
    h.f.beforeRead = (p) => {
      if (!p.includes("search?")) return;
      const a = h.f.attestation,
        w = mutable(a.lifetimes[0]),
        process = mutable(a.process),
        s = h.f.sources[0]!,
        account = h.f.accounts.get("synthetic-a")!.snapshot;
      if (kind === "source-ABA") w.generation = 2; // Same Source id, ordinal, PID/restarts/account. Lifetime differs.
      if (kind === "worker-created") w.workerCreated = "2026-11-06T00:00:01.1234568Z";
      if (kind === "worker-PID") {
        w.workerPid = 102;
        s.pid = 102;
      }
      if (kind === "parent") w.parentPid = 999;
      if (kind === "process-created") {
        process.created = "2026-11-06T00:00:00.1234568Z";
        process.recordedCreated = process.created;
      }
      if (kind === "record") process.recordSha256 = "a".repeat(64);
      if (kind === "state") process.stateSha256 = "a".repeat(64);
      if (kind === "path") process.pathSha256 = "a".repeat(64);
      if (kind === "version") mutable(a.observation).version = "2.0.6";
      if (kind === "contract") h.f.document.components.schemas.Leaf.type = "number";
      if (kind === "source-ID") s.instanceId = "synthetic-b";
      if (kind === "source-number") s.instanceNo = 2;
      if (kind === "restart") s.restartCount++;
      if (kind === "disconnect") s.session.state = "disconnected";
      if (kind === "saved") account.saved_login.available = true;
      if (kind === "L2") account.level2_access = true;
      if (kind === "kind") account.session_kind = "guest";
      if (kind === "peer")
        h.f.sources.push({
          ...s,
          instanceId: "peer",
          pid: 102,
          session: { state: "disconnected" },
        });
    };
    await denied(h);
  });
  it.each([0, 1, 3, -1, 999])("denies raw listener state %s; state-0 UNKNOWN", async (state) => {
    const h = mp8Fixture();
    mutable(h.f.attestation.listener.rows[0]).state = state;
    await denied(h, true);
  });
  it.each([
    "rounded",
    "wildcard",
    "ipv6",
    "duplicate-listener",
    "wrong-owner",
    "missing-family",
    "missing-lifetime",
    "duplicate-lifetime",
    "duplicate-source",
    "duplicate-worker",
    "two-connected",
  ])("denies %s before search", async (kind) => {
    const h = mp8Fixture(),
      a = h.f.attestation;
    if (kind === "rounded") {
      mutable(a.process).created = "2026-11-06T00:00:00.123Z";
      mutable(a.process).recordedCreated = mutable(a.process).created;
    }
    if (kind === "wildcard") mutable(a.listener.rows[0]).address = "0.0.0.0";
    if (kind === "ipv6") mutable(a.listener.rows[0]).family = 23;
    if (kind === "duplicate-listener")
      mutable(a.listener).rows = [...a.listener.rows, ...a.listener.rows];
    if (kind === "wrong-owner") mutable(a.listener.rows[0]).pid = 999;
    if (kind === "missing-family") mutable(a.listener).families = [2];
    if (kind === "missing-lifetime") mutable(a).lifetimes = [];
    if (kind === "duplicate-lifetime") mutable(a).lifetimes = [...a.lifetimes, ...a.lifetimes];
    if (["duplicate-source", "duplicate-worker", "two-connected"].includes(kind))
      h.f.sources.push({
        ...h.f.sources[0]!,
        ...(kind !== "duplicate-source" ? { instanceId: "peer" } : {}),
        ...(kind === "two-connected" ? { pid: 102 } : {}),
      });
    await denied(h, true);
  });
  it("fences Source recreation during the pre-query account sampling", async () => {
    const h = mp8Fixture();
    h.f.beforeAttest = (count) => {
      if (count === 2) mutable(h.f.attestation.lifetimes[0]).generation = 2;
    };
    await denied(h, true);
  });
  it("compares disconnected peer snapshots too", async () => {
    const h = mp8Fixture();
    const peer = {
      ...h.f.sources[0]!,
      instanceId: "peer",
      pid: 102,
      instanceNo: 2,
      session: { state: "disconnected" },
    };
    h.f.sources.push(peer);
    mutable(h.f.attestation).lifetimes = [
      ...h.f.attestation.lifetimes,
      { ...h.f.attestation.lifetimes[0]!, id: "peer", workerPid: 102 },
    ];
    const account = structuredClone(h.f.accounts.get("synthetic-a")!);
    account.snapshot.state = "disconnected";
    h.f.accounts.set("peer", account);
    h.f.beforeRead = (p) => {
      if (p.includes("search?")) account.snapshot.account_display = "PRIVATE_PEER_CHANGED";
    };
    await denied(h);
  });
  it("allows a fresh observation timestamp change without treating it as identity", async () => {
    const h = mp8Fixture();
    h.f.beforeRead = (p) => {
      if (p.includes("search?"))
        h.f.accounts.get("synthetic-a")!.snapshot.observed_at = new Date(h.f.utc + 1).toISOString();
    };
    expect((await h.make().lookup(query)).items).toHaveLength(1);
  });
  it("documents identical display hidden-account swaps remain UNQUALIFIED", async () => {
    const h = mp8Fixture(); // No trusted native account ID/epoch exists in this model.
    expect((await h.make().lookup(query)).items).toHaveLength(1);
    expect(assessCandidate([h.f.profile], h.f.attestation.observation).productionAllowed).toBe(
      false,
    );
  });
});

describe("MP8 no retry, no partial output, bounded/redacted failures", () => {
  it.each([
    "503-json",
    "503-html",
    "timeout",
    "wrong-envelope",
    "sensitive",
    "partial",
    "unknown-coverage",
    "row-count",
    "utf8",
    "oversize",
    "stale",
    "future",
    "legacy-epoch",
  ])("rejects %s", async (kind) => {
    const h = mp8Fixture();
    h.f.beforeRead = (p) => {
      if (kind === "stale")
        h.f.accounts.get("synthetic-a")!.snapshot.observed_at = new Date(
          h.f.utc - 5001,
        ).toISOString();
      if (kind === "future")
        h.f.accounts.get("synthetic-a")!.snapshot.observed_at = new Date(
          h.f.utc + 1001,
        ).toISOString();
      if (kind === "legacy-epoch")
        mutable(h.f.accounts.get("synthetic-a")!.snapshot).session_epoch = 1;
      if (!p.includes("search?")) return;
      if (kind.startsWith("503")) {
        h.f.status = 503;
        h.f.bytes = Buffer.from(
          kind.endsWith("html")
            ? "<html>PRIVATE_SECRET</html>"
            : '{"code":503,"token":"PRIVATE_SECRET"}',
        );
      }
      if (kind === "timeout") throw Error("PRIVATE_SECRET timeout");
      if (kind === "wrong-envelope")
        h.f.bytes = Buffer.from('{"ok":true,"data":{},"token":"PRIVATE_SECRET"}');
      if (kind === "sensitive") mutable(h.f.result.data.items[0]).token = "PRIVATE_SECRET";
      if (kind === "partial") h.f.result.data.coverage.status = "partial";
      if (kind === "unknown-coverage") h.f.result.data.coverage.status = "unknown";
      if (kind === "row-count") h.f.result.data.row_count = 2;
      if (kind === "utf8") h.f.bytes = new Uint8Array([0xc3, 0x28]);
      if (kind === "oversize") h.f.bytes = new Uint8Array(65537);
    };
    await denied(h);
  });
  it.each(["account", "descriptor", "source", "attestation", "process"])(
    "rejects unexpected sensitive field at %s",
    async (target) => {
      const h = mp8Fixture();
      const value =
        target === "account"
          ? h.f.accounts.get("synthetic-a")!.snapshot
          : target === "descriptor"
            ? h.f.accounts.get("synthetic-a")!.descriptor
            : target === "source"
              ? h.f.sources[0]
              : target === "process"
                ? h.f.attestation.process
                : h.f.attestation;
      mutable(value).token = "PRIVATE_SECRET";
      await denied(h, true);
    },
  );
  it.each(["attest", "search", "final-attest"])(
    "5000ms total includes %s and stale completion is discarded",
    async (stage) => {
      const h = mp8Fixture();
      h.f.beforeAttest = (n) => {
        if (stage === "attest" || (stage === "final-attest" && n === 4)) h.f.time = 5000;
      };
      h.f.beforeRead = (p) => {
        if (stage === "search" && p.includes("search?")) h.f.time = 5000;
      };
      await denied(h, stage === "attest");
    },
  );
  it.each(["attest", "read"])(
    "hard deadline aborts an uncooperative %s port with no late query",
    async (stage) => {
      vi.useFakeTimers();
      const h = mp8Fixture();
      let finish!: () => void;
      const gate = new Promise<void>((r) => {
        finish = r;
      });
      if (stage === "attest")
        h.ports.attest.mockImplementationOnce(async () => {
          await gate;
          return structuredClone(h.f.attestation);
        });
      else
        h.ports.read.mockImplementationOnce(async () => {
          await gate;
          return { status: 200, body: Buffer.from("{}") };
        });
      const pending = h.make().lookup(query);
      const assertion = expect(pending).rejects.toHaveProperty("code", "MP8_CANDIDATE_DENIED");
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      finish();
      await vi.advanceTimersByTimeAsync(1);
      expect(searchCount(h.f)).toBe(0);
    },
  );
  it("a delayed failed call cannot contaminate a concurrent valid call", async () => {
    vi.useFakeTimers();
    const h = mp8Fixture();
    let finish!: () => void;
    const gate = new Promise<void>((r) => {
      finish = r;
    });
    h.ports.attest.mockImplementationOnce(async () => {
      await gate;
      return structuredClone(h.f.attestation);
    });
    const candidate = h.make(),
      old = candidate.lookup(query);
    const assertion = expect(old).rejects.toHaveProperty("code", "MP8_CANDIDATE_DENIED");
    expect((await candidate.lookup(query)).items).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    finish();
    await vi.advanceTimersByTimeAsync(1);
    expect(searchCount(h.f)).toBe(1);
  });
});
