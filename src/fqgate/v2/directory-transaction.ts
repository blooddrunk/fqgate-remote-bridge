import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { assertSafeStateDirectory } from "../../supervisor/journal.js";

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const V2 = /^2\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;
const MAX_JSON = 8192;
const ZERO = "0".repeat(64);
export class V2TransactionBlocked extends Error {
  constructor(readonly reason: string) {
    super("FQGate v2 directory transaction blocked");
  }
}
export class V2FixtureCrash extends Error {}
function deny(reason: string): never {
  throw new V2TransactionBlocked(reason);
}
function hash(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) deny("STATE_INVALID");
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(v).sort().join(",") !== expected.sort().join(",")) deny("STATE_INVALID");
}
function counter(v: unknown): boolean {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
function digest(v: unknown): boolean {
  return typeof v === "string" && HASH.test(v);
}

export interface AuthenticatedRelease {
  readonly policyHash: string;
  readonly version: string;
  readonly sequence: number;
  readonly refreshSequence: number;
  readonly freshnessHash: string;
  readonly stableHash: string;
  readonly releaseHash: string;
  readonly artifactHash: string;
  readonly treeHash: string;
}
export interface ReplayLedger extends AuthenticatedRelease {
  readonly schemaVersion: 1;
  readonly previousTreeHash: string;
}
export interface ReleaseAuthority {
  // Security-critical port. No actual release verifier is supplied in R2.
  // A future provider MUST verify independent root, exact signed bytes, revocation,
  // expiry and ZIP-to-tree binding. Test providers are explicitly fake.
  authenticate(): Promise<AuthenticatedRelease>;
  authorizeBaseline(treeHash: string, ledger: ReplayLedger): Promise<void>;
}
export const unavailableV2Authority: ReleaseAuthority = Object.freeze({
  authenticate: async () => deny("BLOCKED_UPSTREAM_SIGNING_CONTRACT"),
  authorizeBaseline: async () => deny("BASELINE_TRUST_REQUIRED"),
});
export type RuntimeIdentity =
  | { readonly kind: "stopped" | "unknown" | "foreign" }
  | { readonly kind: "managed"; readonly identity: string };
function managed(identity: RuntimeIdentity): boolean {
  return (
    identity.kind === "managed" &&
    typeof identity.identity === "string" &&
    HASH.test(identity.identity)
  );
}
export const V2_RUNTIME_GATES = [
  "version",
  "identity",
  "ipv4Loopback",
  "health",
  "openapi",
  "sessionContract",
  "lookup",
  "queueTimeoutContract",
  "l2DegradationContract",
] as const;
export interface DirectoryRuntime {
  ownerIdentity(): Promise<string>;
  ownerExited(identity: string): Promise<boolean>;
  inspect(directory: string): Promise<RuntimeIdentity>;
  stop(directory: string, identity: string): Promise<void>;
  start(directory: string): Promise<void>;
  qualify(
    directory: string,
    release: AuthenticatedRelease,
  ): Promise<Readonly<Record<(typeof V2_RUNTIME_GATES)[number], boolean>>>;
  baselineHealthy(directory: string): Promise<boolean>;
}
export type Checkpoint =
  | "prepared"
  | "baseline-moved"
  | "candidate-active"
  | "security-committed"
  | "committed"
  | "rollback-started"
  | "baseline-restored"
  | "rolled-back";
interface Journal {
  schemaVersion: 1;
  id: string;
  owner: string;
  phase: Checkpoint;
  baselineHash: string;
  candidate: AuthenticatedRelease;
}
function claims(v: unknown): AuthenticatedRelease {
  const r = { ...obj(v) };
  keys(r, [
    "policyHash",
    "version",
    "sequence",
    "refreshSequence",
    "freshnessHash",
    "stableHash",
    "releaseHash",
    "artifactHash",
    "treeHash",
  ]);
  if (
    typeof r.version !== "string" ||
    !V2.test(r.version) ||
    !counter(r.sequence) ||
    !counter(r.refreshSequence) ||
    r.sequence === 0 ||
    r.refreshSequence === 0 ||
    [r.policyHash, r.freshnessHash, r.stableHash, r.releaseHash, r.artifactHash, r.treeHash].some(
      (v) => !digest(v),
    )
  )
    deny("STATE_INVALID");
  return Object.freeze({ ...r }) as unknown as AuthenticatedRelease;
}
export function validateReplayLedger(value: unknown): ReplayLedger {
  const r = { ...obj(value) };
  keys(r, [
    "schemaVersion",
    "policyHash",
    "version",
    "sequence",
    "refreshSequence",
    "freshnessHash",
    "stableHash",
    "releaseHash",
    "artifactHash",
    "treeHash",
    "previousTreeHash",
  ]);
  if (
    r.schemaVersion !== 1 ||
    !counter(r.sequence) ||
    !counter(r.refreshSequence) ||
    typeof r.version !== "string" ||
    [
      r.policyHash,
      r.freshnessHash,
      r.stableHash,
      r.releaseHash,
      r.artifactHash,
      r.treeHash,
      r.previousTreeHash,
    ].some((v) => !digest(v))
  )
    deny("STATE_INVALID");
  const bootstrap =
    r.version === "1.0.5" &&
    r.sequence === 0 &&
    r.refreshSequence === 0 &&
    r.releaseHash === ZERO &&
    r.freshnessHash === ZERO &&
    r.stableHash === ZERO &&
    r.previousTreeHash === ZERO;
  if (!bootstrap) {
    claims(
      Object.fromEntries(
        Object.entries(r).filter(([k]) => !["schemaVersion", "previousTreeHash"].includes(k)),
      ),
    );
  }
  return Object.freeze({ ...r }) as unknown as ReplayLedger;
}
export function advanceReplayLedger(
  inputLedger: ReplayLedger,
  inputRelease: AuthenticatedRelease,
  baselineHash: string,
): ReplayLedger {
  const ledger = validateReplayLedger(inputLedger);
  const release = claims(inputRelease);
  if (release.policyHash !== ledger.policyHash) deny("TRUST_POLICY_CHANGED");
  if (release.sequence <= ledger.sequence || release.refreshSequence <= ledger.refreshSequence)
    deny("REPLAY_OR_EQUIVOCATION");
  const [oldMajor, oldMinor, oldPatch] = ledger.version.split(".").map(Number);
  const [major, minor, patch] = release.version.split(".").map(Number);
  if (
    major! < oldMajor! ||
    (major === oldMajor && (minor! < oldMinor! || (minor === oldMinor && patch! <= oldPatch!)))
  )
    deny("VERSION_NOT_ADVANCING");
  if (release.treeHash === baselineHash) deny("ARTIFACT_NOT_ADVANCING");
  if (baselineHash !== ledger.treeHash && baselineHash !== ledger.previousTreeHash)
    deny("BASELINE_NOT_IN_LEDGER");
  return { schemaVersion: 1, ...release, previousTreeHash: baselineHash };
}
async function regular(path: string): Promise<void> {
  const st = await lstat(path);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1) deny("LINK_OR_SPECIAL_FILE");
}
async function load(path: string): Promise<unknown> {
  await regular(path);
  const st = await lstat(path);
  if (st.size > MAX_JSON) deny("STATE_OVERSIZED");
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return deny("STATE_INVALID");
  }
}
async function save(path: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > MAX_JSON) deny("STATE_OVERSIZED");
  try {
    await regular(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(data);
    await file.sync();
  } finally {
    await file.close();
  }
  // Never delete the old ledger/journal to make replacement succeed. Preserve
  // temporary/old data on failure; Windows power-loss durability is unqualified.
  await rename(temporary, path);
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

export function assertPayloadComponent(name: string): void {
  if (
    !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(name) ||
    /[.]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
  )
    deny("UNSAFE_PAYLOAD_TREE");
}

/** Hashes only explicitly owned immutable payload trees; never run on session data. */
export async function payloadTreeHash(directory: string): Promise<string> {
  await assertSafeStateDirectory(directory);
  const entries: { path: string; bytes: number; sha256: string }[] = [];
  const aliases = new Set<string>();
  let count = 0,
    total = 0;
  async function scan(relative: string): Promise<void> {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      count++;
      if (count > 512) deny("UNSAFE_PAYLOAD_TREE");
      assertPayloadComponent(entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (rel.length > 240 || aliases.has(rel.toLowerCase())) deny("UNSAFE_PAYLOAD_TREE");
      aliases.add(rel.toLowerCase());
      const st = await lstat(join(directory, rel));
      if (st.isSymbolicLink()) deny("LINK_OR_SPECIAL_FILE");
      if (st.isDirectory()) {
        await scan(rel);
        continue;
      }
      await regular(join(directory, rel));
      total += st.size;
      if (st.size > 134217728 || total > 268435456) deny("UNSAFE_PAYLOAD_TREE");
      const data = await readFile(join(directory, rel));
      if (data.length !== st.size) deny("PAYLOAD_CHANGED");
      entries.push({ path: rel, bytes: data.length, sha256: hash(data) });
    }
  }
  await scan("");
  if (!entries.length) deny("UNSAFE_PAYLOAD_TREE");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return hash(JSON.stringify(entries));
}
function validateJournal(v: unknown): Journal {
  const r = { ...obj(v) };
  keys(r, ["schemaVersion", "id", "owner", "phase", "baselineHash", "candidate"]);
  if (
    r.schemaVersion !== 1 ||
    typeof r.id !== "string" ||
    !UUID.test(r.id) ||
    !digest(r.owner) ||
    !digest(r.baselineHash) ||
    ![
      "prepared",
      "baseline-moved",
      "candidate-active",
      "security-committed",
      "committed",
      "rollback-started",
      "baseline-restored",
      "rolled-back",
    ].includes(String(r.phase))
  )
    deny("STATE_INVALID");
  claims(r.candidate);
  return r as unknown as Journal;
}

/** Unconnected kernel. Native process/verification/extraction adapters are absent. */
export class V2DirectoryTransaction {
  constructor(
    readonly root: string,
    private readonly runtime: DirectoryRuntime,
    private readonly authority: ReleaseAuthority = unavailableV2Authority,
    private readonly checkpoint: (phase: Checkpoint) => Promise<void> = async () => {},
  ) {}
  private slot(
    name:
      | "current"
      | "candidate"
      | "previous"
      | "rejected"
      | "security.json"
      | "transaction.json"
      | "transaction.lock"
      | "recovery.lock",
  ): string {
    return join(this.root, name);
  }
  private async ledger(): Promise<ReplayLedger> {
    return validateReplayLedger(await load(this.slot("security.json")));
  }
  private async mark(j: Journal, phase: Checkpoint): Promise<void> {
    j.phase = phase;
    await save(this.slot("transaction.json"), j);
    await this.checkpoint(phase);
  }
  private async stopKnown(directory: string): Promise<void> {
    const identity = await this.runtime.inspect(directory);
    if (identity.kind === "unknown" || identity.kind === "foreign")
      deny("PROCESS_IDENTITY_UNPROVEN");
    if (identity.kind === "managed") {
      if (!HASH.test(identity.identity)) deny("PROCESS_IDENTITY_UNPROVEN");
      await this.runtime.stop(directory, identity.identity);
    }
    if ((await this.runtime.inspect(directory)).kind !== "stopped") deny("PROCESS_NOT_STOPPED");
  }
  private async releaseLock(file: Awaited<ReturnType<typeof open>>): Promise<void> {
    const opened = await file.stat(),
      current = await lstat(this.slot("transaction.lock"));
    if (
      opened.ino !== current.ino ||
      opened.dev !== current.dev ||
      current.nlink !== 1 ||
      current.isSymbolicLink()
    )
      deny("LOCK_IDENTITY_CHANGED");
    await file.close();
    await rm(this.slot("transaction.lock"));
  }
  async upgrade(): Promise<"committed"> {
    // Default authority rejects before any filesystem/process mutation or probes.
    const verified = claims(await this.authority.authenticate());
    await assertSafeStateDirectory(this.root);
    const ledger = await this.ledger();
    const baseline = await payloadTreeHash(this.slot("current"));
    const next = advanceReplayLedger(ledger, verified, baseline);
    await this.authority.authorizeBaseline(baseline, ledger);
    if ((await payloadTreeHash(this.slot("candidate"))) !== verified.treeHash)
      deny("CANDIDATE_HASH_MISMATCH");
    for (const n of ["previous", "rejected", "transaction.json", "recovery.lock"] as const)
      if (await exists(this.slot(n))) deny("UNRESOLVED_TRANSACTION_OR_PREVIOUS");
    const owner = await this.runtime.ownerIdentity();
    if (!HASH.test(owner)) deny("PROCESS_IDENTITY_UNPROVEN");
    const lock = await open(
      this.slot("transaction.lock"),
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    const journal: Journal = {
      schemaVersion: 1,
      id: randomUUID(),
      owner,
      phase: "prepared",
      baselineHash: baseline,
      candidate: verified,
    };
    let release = false,
      journaled = false;
    try {
      await lock.writeFile(JSON.stringify({ schemaVersion: 1, id: journal.id, owner }));
      await lock.sync();
      // Recheck under writer lock before stopping/moving any application.
      if (
        JSON.stringify(await this.ledger()) !== JSON.stringify(ledger) ||
        (await payloadTreeHash(this.slot("current"))) !== baseline ||
        (await payloadTreeHash(this.slot("candidate"))) !== verified.treeHash
      )
        deny("PREFLIGHT_CHANGED");
      await this.mark(journal, "prepared");
      journaled = true;
      await this.stopKnown(this.slot("current"));
      await rename(this.slot("current"), this.slot("previous"));
      await this.mark(journal, "baseline-moved");
      await rename(this.slot("candidate"), this.slot("current"));
      await this.mark(journal, "candidate-active");
      if ((await payloadTreeHash(this.slot("current"))) !== verified.treeHash)
        deny("CANDIDATE_HASH_MISMATCH");
      await this.runtime.start(this.slot("current"));
      const gates = await this.runtime.qualify(this.slot("current"), verified);
      if (V2_RUNTIME_GATES.some((g) => gates[g] !== true)) deny("RUNTIME_QUALIFICATION_FAILED");
      if (!managed(await this.runtime.inspect(this.slot("current"))))
        deny("PROCESS_IDENTITY_UNPROVEN");
      if (
        (await payloadTreeHash(this.slot("current"))) !== verified.treeHash ||
        (await payloadTreeHash(this.slot("previous"))) !== baseline
      )
        deny("PAYLOAD_CHANGED");
      let fresh: AuthenticatedRelease;
      try {
        fresh = claims(await this.authority.authenticate());
      } catch {
        deny("AUTHORITY_RECHECK_FAILED");
      }
      if (
        (Object.keys(verified) as (keyof AuthenticatedRelease)[]).some(
          (k) => fresh[k] !== verified[k],
        )
      )
        deny("AUTHORITY_CHANGED_DURING_ACTIVATION");
      if (JSON.stringify(await this.ledger()) !== JSON.stringify(ledger))
        deny("LEDGER_CHANGED_DURING_ACTIVATION");
      await save(this.slot("security.json"), next);
      await this.mark(journal, "security-committed");
      await this.mark(journal, "committed");
      release = true;
      return "committed";
    } catch (e) {
      if (e instanceof V2FixtureCrash) throw e;
      if (!journaled) {
        release = true;
        throw e;
      }
      try {
        await this.rollback(journal);
        release = true;
      } catch {
        deny("ROLLBACK_BLOCKED_EVIDENCE_PRESERVED");
      }
      throw e instanceof V2TransactionBlocked
        ? e
        : new V2TransactionBlocked("ACTIVATION_FAILED_ROLLED_BACK");
    } finally {
      if (release) await this.releaseLock(lock);
      else await lock.close();
    }
  }
  private async rollback(j: Journal): Promise<void> {
    const ledger = await this.ledger();
    if (j.baselineHash !== ledger.treeHash && j.baselineHash !== ledger.previousTreeHash)
      deny("BASELINE_NOT_IN_LEDGER");
    const current = (await exists(this.slot("current")))
      ? await payloadTreeHash(this.slot("current"))
      : null;
    const previous = (await exists(this.slot("previous")))
      ? await payloadTreeHash(this.slot("previous"))
      : null;
    const rejected = (await exists(this.slot("rejected")))
      ? await payloadTreeHash(this.slot("rejected"))
      : null;
    if (
      current === j.baselineHash &&
      previous === null &&
      (rejected === null || rejected === j.candidate.treeHash)
    ) {
      // Includes interruption before first rename, or after baseline restored.
      await this.mark(j, "baseline-restored");
    } else {
      if (
        previous !== j.baselineHash ||
        (current !== null && current !== j.candidate.treeHash) ||
        (rejected !== null && rejected !== j.candidate.treeHash) ||
        (current !== null && rejected !== null)
      )
        deny("AMBIGUOUS_OR_CHANGED_SLOTS");
      await this.mark(j, "rollback-started");
      if (current !== null) {
        await this.stopKnown(this.slot("current"));
        await rename(this.slot("current"), this.slot("rejected"));
      } else if ((await this.runtime.inspect(this.slot("current"))).kind !== "stopped")
        deny("PROCESS_IDENTITY_UNPROVEN");
      await rename(this.slot("previous"), this.slot("current"));
      await this.mark(j, "baseline-restored");
    }
    if ((await payloadTreeHash(this.slot("current"))) !== j.baselineHash)
      deny("BASELINE_HASH_MISMATCH");
    const state = await this.runtime.inspect(this.slot("current"));
    if (state.kind === "stopped") await this.runtime.start(this.slot("current"));
    else if (state.kind !== "managed") deny("PROCESS_IDENTITY_UNPROVEN");
    if (
      !managed(await this.runtime.inspect(this.slot("current"))) ||
      (await this.runtime.baselineHealthy(this.slot("current"))) !== true
    )
      deny("BASELINE_HEALTH_FAILED");
    await this.mark(j, "rolled-back");
    // Ledger may already have advanced. Never reset high-water marks on rollback.
  }
  async recover(): Promise<"committed" | "rolled-back"> {
    await assertSafeStateDirectory(this.root);
    const j = validateJournal(await load(this.slot("transaction.json"))),
      lockRecord = obj(await load(this.slot("transaction.lock")));
    keys(lockRecord, ["schemaVersion", "id", "owner"]);
    if (
      lockRecord.schemaVersion !== 1 ||
      lockRecord.id !== j.id ||
      lockRecord.owner !== j.owner ||
      (await this.runtime.ownerExited(j.owner)) !== true
    )
      deny("LOCK_OWNER_NOT_PROVEN_EXITED");
    await this.authority.authorizeBaseline(j.baselineHash, await this.ledger());
    const recoveryOwner = await this.runtime.ownerIdentity();
    if (!HASH.test(recoveryOwner)) deny("PROCESS_IDENTITY_UNPROVEN");
    const guard = await open(this.slot("recovery.lock"), "wx", 0o600);
    await guard.writeFile(JSON.stringify({ owner: recoveryOwner, id: j.id }));
    await guard.sync();
    const lock = await open(this.slot("transaction.lock"), "r+");
    let release = false;
    try {
      const ledger = await this.ledger();
      const current = await payloadTreeHash(this.slot("current")).catch(async (e) => {
        if (!(await exists(this.slot("current")))) return null;
        throw e;
      });
      if (
        ["baseline-restored", "rolled-back"].includes(j.phase) &&
        (current !== j.baselineHash || (await exists(this.slot("previous"))))
      )
        deny("JOURNAL_PHASE_UNREACHABLE");
      if (["prepared", "baseline-moved"].includes(j.phase) && ledger.treeHash !== j.baselineHash)
        deny("JOURNAL_PHASE_UNREACHABLE");
      if (ledger.treeHash === j.candidate.treeHash) {
        if (
          ledger.previousTreeHash !== j.baselineHash ||
          (Object.keys(j.candidate) as (keyof AuthenticatedRelease)[]).some(
            (k) => ledger[k] !== j.candidate[k],
          )
        )
          deny("JOURNAL_LEDGER_MISMATCH");
      } else if (ledger.treeHash === j.baselineHash) {
        advanceReplayLedger(ledger, j.candidate, j.baselineHash);
        if (["security-committed", "committed"].includes(j.phase))
          deny("JOURNAL_PHASE_UNREACHABLE");
      } else deny("JOURNAL_LEDGER_MISMATCH");
      if (j.phase === "committed") {
        if (
          ledger.treeHash !== j.candidate.treeHash ||
          ledger.sequence !== j.candidate.sequence ||
          ledger.refreshSequence !== j.candidate.refreshSequence ||
          ledger.policyHash !== j.candidate.policyHash ||
          (await payloadTreeHash(this.slot("current"))) !== j.candidate.treeHash ||
          (await payloadTreeHash(this.slot("previous"))) !== j.baselineHash
        )
          deny("COMMITTED_STATE_MISMATCH");
        const authenticated = claims(await this.authority.authenticate());
        if (
          (Object.keys(authenticated) as (keyof AuthenticatedRelease)[]).some(
            (k) => authenticated[k] !== j.candidate[k],
          )
        )
          deny("COMMITTED_AUTHORITY_CHANGED");
        if (!managed(await this.runtime.inspect(this.slot("current"))))
          deny("COMMITTED_RUNTIME_NOT_CONFIRMED");
        const gates = await this.runtime.qualify(this.slot("current"), authenticated);
        if (V2_RUNTIME_GATES.some((g) => gates[g] !== true))
          deny("COMMITTED_RUNTIME_NOT_CONFIRMED");
        release = true;
        return "committed";
      }
      await this.rollback(j);
      release = true;
      return "rolled-back";
    } finally {
      if (release) {
        await this.releaseLock(lock);
        await guard.close();
        await rm(this.slot("recovery.lock"));
      } else {
        await lock.close();
        await guard.close();
      }
    }
  }
}
