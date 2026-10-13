import { mkdtemp, mkdir, readFile, writeFile, rm, access, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceReplayLedger,
  assertPayloadComponent,
  payloadTreeHash,
  validateReplayLedger,
  V2DirectoryTransaction,
  V2FixtureCrash,
  V2_RUNTIME_GATES,
  unavailableV2Authority,
  type AuthenticatedRelease,
  type Checkpoint,
  type DirectoryRuntime,
  type ReplayLedger,
  type RuntimeIdentity,
} from "../src/fqgate/v2/directory-transaction.js";
const roots: string[] = [];
const hash = (c: string) => c.repeat(64);
async function present(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "v2-transaction-inert-"));
  roots.push(root);
  for (const name of ["current", "candidate"]) {
    await mkdir(join(root, name));
    await mkdir(join(root, name, "resources"));
    await writeFile(join(root, name, "FQGate.exe"), `inert ${name} executable text, never run`);
    await writeFile(
      join(root, name, "fqgate-updater.exe"),
      `inert ${name} updater text, never run`,
    );
    await writeFile(join(root, name, "resources", "app.txt"), `inert ${name} resource`);
  }
  const baseline = await payloadTreeHash(join(root, "current")),
    candidate = await payloadTreeHash(join(root, "candidate"));
  const initial: ReplayLedger = {
    schemaVersion: 1,
    policyHash: hash("a"),
    version: "1.0.5",
    sequence: 0,
    refreshSequence: 0,
    freshnessHash: hash("0"),
    stableHash: hash("0"),
    releaseHash: hash("0"),
    artifactHash: hash("b"),
    treeHash: baseline,
    previousTreeHash: hash("0"),
  };
  const release: AuthenticatedRelease = {
    policyHash: hash("a"),
    version: "2.0.5",
    sequence: 8,
    refreshSequence: 9,
    freshnessHash: hash("1"),
    stableHash: hash("2"),
    releaseHash: hash("c"),
    artifactHash: hash("d"),
    treeHash: candidate,
  };
  await writeFile(join(root, "security.json"), JSON.stringify(initial));
  let state: RuntimeIdentity = { kind: "managed", identity: hash("e") };
  const runtime: DirectoryRuntime = {
    ownerIdentity: vi.fn(async () => hash("f")),
    ownerExited: vi.fn(async () => true),
    inspect: vi.fn(async () => state),
    stop: vi.fn(async () => {
      state = { kind: "stopped" };
    }),
    start: vi.fn(async () => {
      state = { kind: "managed", identity: hash("e") };
    }),
    qualify: vi.fn(
      async () =>
        Object.fromEntries(V2_RUNTIME_GATES.map((g) => [g, true])) as Record<
          (typeof V2_RUNTIME_GATES)[number],
          boolean
        >,
    ),
    baselineHealthy: vi.fn(async () => true),
  };
  const authority = {
    authenticate: vi.fn(async () => release),
    authorizeBaseline: vi.fn(async (tree: string) => {
      if (tree !== baseline) throw new Error("Fixture baseline is not known good");
    }),
  }; // FAKE: not publisher authentication.
  return {
    root,
    baseline,
    candidate,
    initial,
    release,
    runtime,
    authority,
    setState: (s: RuntimeIdentity) => {
      state = s;
    },
    transaction: (checkpoint?: (p: Checkpoint) => Promise<void>) =>
      new V2DirectoryTransaction(root, runtime, authority, checkpoint),
  };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
describe("unconnected v2 directory kernel, inert files and FAKE authority/runtime only", () => {
  it("default missing authority refuses before filesystem or process mutation", async () => {
    expect(Object.isFrozen(unavailableV2Authority)).toBe(true);
    const f = await fixture(),
      before = await readFile(join(f.root, "security.json"));
    await expect(new V2DirectoryTransaction(f.root, f.runtime).upgrade()).rejects.toMatchObject({
      reason: "BLOCKED_UPSTREAM_SIGNING_CONTRACT",
    });
    expect(f.runtime.inspect).not.toHaveBeenCalled();
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(f.runtime.start).not.toHaveBeenCalled();
    expect(await readFile(join(f.root, "security.json"))).toEqual(before);
    expect(await present(join(f.root, "transaction.lock"))).toBe(false);
  });
  it("requires independently trusted baseline proof before touching processes/files", async () => {
    const f = await fixture();
    vi.mocked(f.authority.authorizeBaseline).mockRejectedValue(new Error("not trusted"));
    await expect(f.transaction().upgrade()).rejects.toThrow();
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(await present(join(f.root, "transaction.lock"))).toBe(false);
  });
  it("default unavailable baseline authority forbids even recovery actuation", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "candidate-active") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    vi.mocked(f.runtime.stop).mockClear();
    vi.mocked(f.runtime.start).mockClear();
    await expect(new V2DirectoryTransaction(f.root, f.runtime).recover()).rejects.toMatchObject({
      reason: "BASELINE_TRUST_REQUIRED",
    });
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(f.runtime.start).not.toHaveBeenCalled();
    expect(await present(join(f.root, "recovery.lock"))).toBe(false);
  });
  it("switches the FULL inert directory, retains full baseline, advances flushed ledger", async () => {
    const f = await fixture();
    expect(await f.transaction().upgrade()).toBe("committed");
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.candidate);
    expect(await payloadTreeHash(join(f.root, "previous"))).toBe(f.baseline);
    expect(await readFile(join(f.root, "current", "resources", "app.txt"), "utf8")).toContain(
      "candidate",
    );
    expect(
      validateReplayLedger(JSON.parse(await readFile(join(f.root, "security.json"), "utf8"))),
    ).toMatchObject({ sequence: 8, refreshSequence: 9, previousTreeHash: f.baseline });
    expect(await present(join(f.root, "transaction.lock"))).toBe(false);
  });
  it.each(V2_RUNTIME_GATES)("rolls back the entire inert baseline on failed %s", async (gate) => {
    const f = await fixture();
    vi.mocked(f.runtime.qualify).mockResolvedValue({
      ...Object.fromEntries(V2_RUNTIME_GATES.map((g) => [g, true])),
      [gate]: false,
    } as Record<(typeof V2_RUNTIME_GATES)[number], boolean>);
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "RUNTIME_QUALIFICATION_FAILED",
    });
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
    expect(await payloadTreeHash(join(f.root, "rejected"))).toBe(f.candidate);
    expect(JSON.parse(await readFile(join(f.root, "security.json"), "utf8"))).toEqual(f.initial);
    expect(await present(join(f.root, "transaction.lock"))).toBe(false);
  });
  it.each(["unknown", "foreign"] as const)("never stops/adopts %s runtime", async (kind) => {
    const f = await fixture();
    f.setState({ kind });
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "ROLLBACK_BLOCKED_EVIDENCE_PRESERVED",
    });
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(f.runtime.start).not.toHaveBeenCalled();
    expect(await present(join(f.root, "transaction.lock"))).toBe(true);
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
  });
  it("refuses an altered candidate before stopping any process", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "candidate", "FQGate.exe"), "tampered inert");
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "CANDIDATE_HASH_MISMATCH",
    });
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(await present(join(f.root, "transaction.lock"))).toBe(false);
  });
  it.each(["security.json", "transaction.lock", "previous", "rejected"])(
    "never clears preexisting %s to allow upgrade",
    async (name) => {
      const f = await fixture();
      if (name === "security.json") await writeFile(join(f.root, name), "corrupt");
      else await writeFile(join(f.root, name), "operator state");
      const bytes = await readFile(join(f.root, name));
      await expect(f.transaction().upgrade()).rejects.toThrow();
      expect(await readFile(join(f.root, name))).toEqual(bytes);
      expect(f.runtime.stop).not.toHaveBeenCalled();
    },
  );
  it("missing trusted bootstrap state never silently bootstraps", async () => {
    const f = await fixture();
    await rm(join(f.root, "security.json"));
    await expect(f.transaction().upgrade()).rejects.toThrow();
    expect(await present(join(f.root, "security.json"))).toBe(false);
    expect(f.runtime.start).not.toHaveBeenCalled();
  });
  it.each([
    "prepared",
    "baseline-moved",
    "candidate-active",
    "security-committed",
    "committed",
  ] as const)(
    "recovers a simulated crash at %s using owner-exit proof, without executing any binary",
    async (phase) => {
      const f = await fixture();
      await expect(
        f
          .transaction(async (p) => {
            if (p === phase) throw new V2FixtureCrash();
          })
          .upgrade(),
      ).rejects.toBeInstanceOf(V2FixtureCrash);
      expect(await present(join(f.root, "transaction.lock"))).toBe(true);
      const expected = phase === "committed" ? "committed" : "rolled-back";
      expect(await f.transaction().recover()).toBe(expected);
      expect(await payloadTreeHash(join(f.root, "current"))).toBe(
        expected === "committed" ? f.candidate : f.baseline,
      );
      const ledger = JSON.parse(await readFile(join(f.root, "security.json"), "utf8"));
      expect(ledger.sequence).toBe(["security-committed", "committed"].includes(phase) ? 8 : 0);
      expect(await present(join(f.root, "transaction.lock"))).toBe(false);
      expect(await present(join(f.root, "recovery.lock"))).toBe(false);
    },
  );
  it.each(["unknown", "foreign", "stopped"] as const)(
    "committed crash does not assert runtime qualification with %s identity",
    async (kind) => {
      const f = await fixture();
      await expect(
        f
          .transaction(async (p) => {
            if (p === "committed") throw new V2FixtureCrash();
          })
          .upgrade(),
      ).rejects.toThrow();
      f.setState({ kind });
      await expect(f.transaction().recover()).rejects.toMatchObject({
        reason: "COMMITTED_RUNTIME_NOT_CONFIRMED",
      });
      expect(await present(join(f.root, "transaction.lock"))).toBe(true);
      expect(await present(join(f.root, "recovery.lock"))).toBe(true);
    },
  );
  it.each(["id", "owner", "phase", "baselineHash", "candidate"])(
    "corrupt journal %s never becomes a recovery action",
    async (field) => {
      const f = await fixture();
      await expect(
        f
          .transaction(async (p) => {
            if (p === "candidate-active") throw new V2FixtureCrash();
          })
          .upgrade(),
      ).rejects.toThrow();
      const path = join(f.root, "transaction.json"),
        j = JSON.parse(await readFile(path, "utf8"));
      j[field] = "invalid";
      await writeFile(path, JSON.stringify(j));
      vi.mocked(f.runtime.stop).mockClear();
      vi.mocked(f.runtime.start).mockClear();
      await expect(f.transaction().recover()).rejects.toThrow();
      expect(f.runtime.stop).not.toHaveBeenCalled();
      expect(f.runtime.start).not.toHaveBeenCalled();
    },
  );
  it("live or unproven lock owner forbids recovery before process/file actions", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "candidate-active") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    vi.mocked(f.runtime.ownerExited).mockResolvedValue(false);
    vi.mocked(f.runtime.stop).mockClear();
    vi.mocked(f.runtime.start).mockClear();
    await expect(f.transaction().recover()).rejects.toMatchObject({
      reason: "LOCK_OWNER_NOT_PROVEN_EXITED",
    });
    expect(f.runtime.stop).not.toHaveBeenCalled();
    expect(f.runtime.start).not.toHaveBeenCalled();
    expect(await present(join(f.root, "transaction.lock"))).toBe(true);
  });
  it("rollback hash failure preserves lock, journal and both trees", async () => {
    const f = await fixture();
    vi.mocked(f.runtime.qualify).mockImplementation(async () => {
      await writeFile(join(f.root, "previous", "resources", "app.txt"), "tampered baseline");
      throw new Error("probe failed");
    });
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "ROLLBACK_BLOCKED_EVIDENCE_PRESERVED",
    });
    expect(await present(join(f.root, "transaction.lock"))).toBe(true);
    expect(await present(join(f.root, "transaction.json"))).toBe(true);
    expect(await present(join(f.root, "previous"))).toBe(true);
  });
  it("baseline health failure preserves recovery evidence", async () => {
    const f = await fixture();
    vi.mocked(f.runtime.baselineHealthy).mockResolvedValue(false);
    vi.mocked(f.runtime.qualify).mockRejectedValue(new Error("failure"));
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "ROLLBACK_BLOCKED_EVIDENCE_PRESERVED",
    });
    expect(await present(join(f.root, "transaction.lock"))).toBe(true);
  });
  it("cannot overwrite another recovery guard", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "prepared") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    await writeFile(join(f.root, "recovery.lock"), "operator guard");
    await expect(f.transaction().recover()).rejects.toThrow();
    expect(await readFile(join(f.root, "recovery.lock"), "utf8")).toBe("operator guard");
  });
  it("rejects non-UUID transaction identity even if journal and lock agree", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "prepared") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    for (const file of ["transaction.json", "transaction.lock"]) {
      const path = join(f.root, file),
        v = JSON.parse(await readFile(path, "utf8"));
      v.id = "-".repeat(36);
      await writeFile(path, JSON.stringify(v));
    }
    vi.mocked(f.runtime.start).mockClear();
    await expect(f.transaction().recover()).rejects.toThrow();
    expect(f.runtime.start).not.toHaveBeenCalled();
  });
  it("truthy nonboolean owner proof never permits lock takeover", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "prepared") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    vi.mocked(f.runtime.ownerExited).mockResolvedValue("yes" as unknown as boolean);
    await expect(f.transaction().recover()).rejects.toMatchObject({
      reason: "LOCK_OWNER_NOT_PROVEN_EXITED",
    });
  });
  it("truthy nonboolean baseline health never closes rollback", async () => {
    const f = await fixture();
    vi.mocked(f.runtime.qualify).mockRejectedValue(new Error("failure"));
    vi.mocked(f.runtime.baselineHealthy).mockResolvedValue("healthy" as unknown as boolean);
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "ROLLBACK_BLOCKED_EVIDENCE_PRESERVED",
    });
  });
  it("managed label with malformed identity never qualifies committed state", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "committed") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    f.setState({ kind: "managed", identity: "invalid" });
    await expect(f.transaction().recover()).rejects.toMatchObject({
      reason: "COMMITTED_RUNTIME_NOT_CONFIRMED",
    });
  });
  it("authenticated snapshot is immutable and changing authority cannot change journal facts", async () => {
    const f = await fixture();
    vi.mocked(f.runtime.qualify).mockImplementation(async (_d, verified) => {
      expect(Object.isFrozen(verified)).toBe(true);
      (f.release as { version: string }).version = "2.0.6";
      return Object.fromEntries(V2_RUNTIME_GATES.map((g) => [g, true])) as Record<
        (typeof V2_RUNTIME_GATES)[number],
        boolean
      >;
    });
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "AUTHORITY_CHANGED_DURING_ACTIVATION",
    });
    expect(JSON.parse(await readFile(join(f.root, "security.json"), "utf8"))).toEqual(f.initial);
    expect(
      JSON.parse(await readFile(join(f.root, "transaction.json"), "utf8")).candidate.version,
    ).toBe("2.0.5");
  });
  it.each(["freshnessHash", "stableHash"] as const)(
    "same counters with changed %s cannot commit under an earlier proof",
    async (field) => {
      const f = await fixture();
      vi.mocked(f.authority.authenticate)
        .mockResolvedValueOnce(f.release)
        .mockResolvedValueOnce({ ...f.release, [field]: hash("7") });
      await expect(f.transaction().upgrade()).rejects.toMatchObject({
        reason: "AUTHORITY_CHANGED_DURING_ACTIVATION",
      });
      expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
      expect(JSON.parse(await readFile(join(f.root, "security.json"), "utf8"))).toEqual(f.initial);
    },
  );
  it("expired/revoked authority at commit recheck restores baseline and never advances ledger", async () => {
    const f = await fixture();
    vi.mocked(f.authority.authenticate)
      .mockResolvedValueOnce(f.release)
      .mockRejectedValueOnce(new Error("fixture revocation"));
    await expect(f.transaction().upgrade()).rejects.toMatchObject({
      reason: "AUTHORITY_RECHECK_FAILED",
    });
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
    expect(JSON.parse(await readFile(join(f.root, "security.json"), "utf8"))).toEqual(f.initial);
  });
  it("refuses a fabricated closed journal phase instead of replaying an actuator", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "candidate-active") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    const path = join(f.root, "transaction.json"),
      j = JSON.parse(await readFile(path, "utf8"));
    j.phase = "rolled-back";
    await writeFile(path, JSON.stringify(j));
    vi.mocked(f.runtime.stop).mockClear();
    await expect(f.transaction().recover()).rejects.toMatchObject({
      reason: "JOURNAL_PHASE_UNREACHABLE",
    });
    expect(f.runtime.stop).not.toHaveBeenCalled();
  });
  it("keeps runtime data and WebView2 profile separate through simulated directory rollback", async () => {
    const f = await fixture();
    for (const directory of ["data", "WebView2"]) {
      await mkdir(join(f.root, directory));
      await writeFile(join(f.root, directory, "fixture.txt"), "inert runtime/profile fixture");
    }
    await expect(
      f
        .transaction(async (phase) => {
          if (phase === "candidate-active") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    await f.transaction().recover();
    for (const directory of ["data", "WebView2"])
      expect(await readFile(join(f.root, directory, "fixture.txt"), "utf8")).toBe(
        "inert runtime/profile fixture",
      );
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
    const stops = vi.mocked(f.runtime.stop).mock.calls.length,
      starts = vi.mocked(f.runtime.start).mock.calls.length;
    await expect(f.transaction().recover()).rejects.toThrow();
    expect(f.runtime.stop).toHaveBeenCalledTimes(stops);
    expect(f.runtime.start).toHaveBeenCalledTimes(starts);
  });
  it("repeated recovery after failed rollback preserves guard, slots and immutable evidence", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (phase) => {
          if (phase === "candidate-active") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    vi.mocked(f.runtime.baselineHealthy).mockResolvedValue(false);
    await expect(f.transaction().recover()).rejects.toThrow();
    const files = ["transaction.json", "transaction.lock", "recovery.lock", "security.json"];
    const before = await Promise.all(files.map((name) => readFile(join(f.root, name), "utf8")));
    const stops = vi.mocked(f.runtime.stop).mock.calls.length,
      starts = vi.mocked(f.runtime.start).mock.calls.length;
    await expect(f.transaction().recover()).rejects.toThrow();
    expect(await Promise.all(files.map((name) => readFile(join(f.root, name), "utf8")))).toEqual(
      before,
    );
    expect(f.runtime.stop).toHaveBeenCalledTimes(stops);
    expect(f.runtime.start).toHaveBeenCalledTimes(starts);
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
  });
  it("never resets high-water on interrupted post-ledger rollback", async () => {
    const f = await fixture();
    await expect(
      f
        .transaction(async (p) => {
          if (p === "security-committed") throw new V2FixtureCrash();
        })
        .upgrade(),
    ).rejects.toThrow();
    await f.transaction().recover();
    const l = validateReplayLedger(
      JSON.parse(await readFile(join(f.root, "security.json"), "utf8")),
    );
    expect(l.sequence).toBe(8);
    expect(l.treeHash).toBe(f.candidate);
    expect(await payloadTreeHash(join(f.root, "current"))).toBe(f.baseline);
    expect(() => advanceReplayLedger(l, f.release, f.baseline)).toThrow();
  });
  it("does not overwrite externally advanced ledger during qualification", async () => {
    const f = await fixture();
    vi.mocked(f.runtime.qualify).mockImplementation(async () => {
      await writeFile(
        join(f.root, "security.json"),
        JSON.stringify({
          ...f.initial,
          version: "2.0.6",
          sequence: 10,
          refreshSequence: 11,
          releaseHash: hash("9"),
        }),
      );
      return Object.fromEntries(V2_RUNTIME_GATES.map((g) => [g, true])) as Record<
        (typeof V2_RUNTIME_GATES)[number],
        boolean
      >;
    });
    await expect(f.transaction().upgrade()).rejects.toThrow();
    expect(JSON.parse(await readFile(join(f.root, "security.json"), "utf8")).sequence).toBe(10);
  });
});
describe("strict persistent replay-state and payload negatives; no publisher verifier claimed", () => {
  it.each([
    "sequence",
    "refreshSequence",
    "version",
    "policyHash",
    "freshnessHash",
    "stableHash",
    "releaseHash",
    "treeHash",
  ])("rejects invalid ledger %s", async (field) => {
    const f = await fixture();
    expect(() => validateReplayLedger({ ...f.initial, [field]: "invalid" })).toThrow();
  });
  it.each([null, [], {}, { schemaVersion: 1 }, { schemaVersion: 1, sequence: Infinity }])(
    "rejects malformed ledger",
    (value) => {
      expect(() => validateReplayLedger(value)).toThrow();
    },
  );
  it("rejects undeclared persistent keys", async () => {
    const f = await fixture();
    expect(() => validateReplayLedger({ ...f.initial, actuator: "restart" })).toThrow();
  });
  it.each(["sequence", "refreshSequence"] as const)(
    "rejects replay, regression and equivocation %s",
    async (field) => {
      const f = await fixture();
      const l = advanceReplayLedger(f.initial, f.release, f.baseline);
      for (const n of [0, l[field] - 1, l[field]])
        expect(() =>
          advanceReplayLedger(
            l,
            {
              ...f.release,
              version: "2.0.6",
              sequence: 20,
              refreshSequence: 20,
              [field]: n,
              releaseHash: hash("8"),
            },
            f.candidate,
          ),
        ).toThrow();
    },
  );
  it("identical candidate tree cannot be relabeled as a newer release", async () => {
    const f = await fixture();
    expect(() =>
      advanceReplayLedger(f.initial, { ...f.release, treeHash: f.baseline }, f.baseline),
    ).toThrow();
  });
  it("rejects policy rotation and version regression without authenticated policy", async () => {
    const f = await fixture(),
      l = advanceReplayLedger(f.initial, f.release, f.baseline);
    expect(() =>
      advanceReplayLedger(
        l,
        {
          ...f.release,
          version: "2.0.6",
          sequence: 10,
          refreshSequence: 11,
          policyHash: hash("7"),
        },
        f.candidate,
      ),
    ).toThrow();
    expect(() =>
      advanceReplayLedger(
        l,
        { ...f.release, version: "2.0.4", sequence: 10, refreshSequence: 11 },
        f.candidate,
      ),
    ).toThrow();
  });
  it.each(["CON.txt", "nul", "COM1.exe", "trailing.", "../escape", "path:stream"])(
    "rejects unsafe Windows payload component %s without needing to materialize it",
    (name) => {
      expect(() => assertPayloadComponent(name)).toThrow();
    },
  );
  it("rejects hard-linked payload files", async () => {
    const f = await fixture();
    await link(join(f.root, "candidate", "FQGate.exe"), join(f.root, "candidate", "alias.exe"));
    await expect(payloadTreeHash(join(f.root, "candidate"))).rejects.toThrow();
  });
  it("hashes the exact official root plugin directory and rejects other hidden/nested names", async () => {
    const f = await fixture();
    const directory = join(f.root, "candidate", ".fqgate-plugin-package");
    await mkdir(directory);
    await writeFile(join(directory, "fixture.dll"), "inert plugin fixture, never executed");
    expect(await payloadTreeHash(join(f.root, "candidate"))).not.toBe(f.candidate);
    await mkdir(join(directory, ".fqgate-plugin-package"));
    await expect(payloadTreeHash(join(f.root, "candidate"))).rejects.toThrow();
    await rm(join(directory, ".fqgate-plugin-package"), { recursive: true });
    await mkdir(join(f.root, "candidate", ".other"));
    await expect(payloadTreeHash(join(f.root, "candidate"))).rejects.toThrow();
  });
  it("rejects directory links/junctions without following them", async () => {
    const f = await fixture();
    await symlink(join(f.root, "current"), join(f.root, "candidate", "linked"), "junction");
    await expect(payloadTreeHash(join(f.root, "candidate"))).rejects.toThrow();
  });
});
