import { win32 } from "node:path";

// Test-only requirements model. No launcher, filesystem, transport or native identity authority.
export interface FixtureInstance {
  alias: string;
  port: number;
  process: { pid: number; created: string; executable: string; alive: boolean };
  listener: { address: string; pid: number } | null;
  worker: { pid: number; parentPid: number; created: string; restarts: number };
  storage: {
    data: string;
    webview: string;
    savedLogin: string;
    links: "clear" | "link" | "unknown";
  };
  source: { id: string; number: number; state: "connected" | "disconnected" };
  // These are invented fixture tokens, NEVER derived from a nickname/native snapshot.
  fixtureAccount: string;
  fixtureEpoch: string;
  l2: boolean;
  flags: string[];
}
const pathKey = (path: string) => {
  if (
    !/^[a-z]:\\/i.test(path) ||
    /[<>"|?*]/.test(path) ||
    [...path].some((c) => c.charCodeAt(0) < 32) ||
    path.length > 512
  )
    throw Error();
  // Refuse ambiguous Win32 aliases rather than pretending lexical normalization resolves links.
  const parts = path.slice(3).split("\\");
  if (parts.some((part) => !part || /[. ]$/.test(part) || part.includes(":"))) throw Error();
  return win32.normalize(path).toLowerCase();
};
const overlap = (a: string, b: string) =>
  a === b || a.startsWith(b + "\\") || b.startsWith(a + "\\");

export function inspectFixtureTopology(instances: readonly FixtureInstance[]) {
  const failures = new Set<string>();
  if (instances.length !== 2) failures.add("TWO_INSTANCES_REQUIRED");
  const aliases = new Set<string>(),
    ports = new Set<number>(),
    pids = new Set<number>();
  const roots: { owner: number; path: string }[] = [];
  instances.forEach((row, owner) => {
    if (!/^p_[a-f0-9]{32}$/.test(row.alias) || aliases.has(row.alias))
      failures.add("ALIAS_CONFLICT");
    aliases.add(row.alias);
    if (!Number.isInteger(row.port) || row.port < 1024 || row.port > 65535 || ports.has(row.port))
      failures.add("PORT_CONFLICT");
    ports.add(row.port);
    for (const pid of [row.process.pid, row.worker.pid]) {
      if (!Number.isSafeInteger(pid) || pid <= 0 || pids.has(pid)) failures.add("PROCESS_CONFLICT");
      pids.add(pid);
    }
    if (
      !row.process.alive ||
      !row.process.created ||
      !row.worker.created ||
      !row.process.executable
    )
      failures.add("PROCESS_UNAVAILABLE");
    if (row.worker.parentPid !== row.process.pid) failures.add("WORKER_OWNERSHIP");
    if (!Number.isSafeInteger(row.worker.restarts) || row.worker.restarts < 0)
      failures.add("WORKER_IDENTITY");
    if (!row.listener) failures.add("LISTENER_ABSENT");
    else if (row.listener.address !== "127.0.0.1" || row.listener.pid !== row.process.pid)
      failures.add("LISTENER_OWNERSHIP");
    if (row.storage.links !== "clear") failures.add("STORAGE_LINK_OR_UNKNOWN");
    for (const path of [row.storage.data, row.storage.webview, row.storage.savedLogin]) {
      try {
        roots.push({ owner, path: pathKey(path) });
      } catch {
        failures.add("STORAGE_PATH_AMBIGUOUS");
      }
    }
    // No reviewed public 2.0.5 independent-port/data-root flags exist in MP-3.
    // Rejection here is NOT a claim about how the executable parses unknown flags.
    if (row.flags.length) failures.add("UNDOCUMENTED_LAUNCH_ARGUMENT");
    if (!row.source.id || !Number.isSafeInteger(row.source.number) || row.source.number <= 0)
      failures.add("SOURCE_UNKNOWN");
    if (!row.fixtureAccount || !row.fixtureEpoch) failures.add("FIXTURE_IDENTITY_UNKNOWN");
  });
  for (const a of roots)
    for (const b of roots)
      if (a.owner !== b.owner && overlap(a.path, b.path)) failures.add("STORAGE_OVERLAP");
  if (instances.length === 2 && instances[0]!.fixtureAccount === instances[1]!.fixtureAccount)
    failures.add("DUPLICATE_FIXTURE_ACCOUNT");
  return {
    evidence: "FIXTURE_ONLY" as const,
    consistent: failures.size === 0,
    failures: [...failures].sort(),
    nativeEngineeringDecision: "UNKNOWN" as const,
    qualification: "LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED" as const,
  };
}

export type FixtureOperation = "status" | "lookup" | "qr.begin" | "qr.poll";
// Captures both deployments: authentication effects on a peer also invalidate a pending read.
const snapshotKey = (rows: readonly FixtureInstance[]) => JSON.stringify(rows);
export function createFixtureFence(observe: () => FixtureInstance[]) {
  let generation = 0,
    qrBusy = false,
    nextFlow = 0;
  const flows = new Map<number, { alias: string; generation: number; identity: string }>();
  const invalidate = () => {
    generation++;
    flows.clear();
  };
  return {
    invalidate,
    async run(options: {
      alias: string;
      operation: FixtureOperation;
      flow?: number;
      work: (alias: string) => Promise<{ alias: string; value: string }>;
      within: <T>(work: Promise<T>) => Promise<T>;
      signal?: AbortSignal;
    }) {
      const denied = () => ({ evidence: "FIXTURE_ONLY", outcome: "DISCARDED" }) as const;
      const rows = structuredClone(observe());
      if (!inspectFixtureTopology(rows).consistent) {
        invalidate();
        return denied();
      }
      if (options.signal?.aborted) return denied();
      const selected = rows.find((r) => r.alias === options.alias);
      if (!selected || (options.operation === "lookup" && selected.source.state !== "connected"))
        return denied();
      const authentication = options.operation.startsWith("qr.");
      if (authentication && qrBusy) return denied();
      if (options.operation === "qr.poll") {
        const flow = flows.get(options.flow ?? -1);
        if (
          !flow ||
          flow.alias !== options.alias ||
          flow.generation !== generation ||
          flow.identity !== snapshotKey(rows)
        )
          return denied();
      }
      if (authentication) {
        invalidate();
        qrBusy = true;
      }
      const startGeneration = generation,
        identity = snapshotKey(rows);
      // Keep auth mutex until the injected work settles, even after timeout/cancellation.
      let pending: Promise<{ alias: string; value: string }>;
      try {
        pending = options.work(selected.alias);
      } catch {
        if (authentication) qrBusy = false;
        return denied();
      }
      if (authentication)
        pending = pending.finally(() => {
          qrBusy = false;
        });
      try {
        const result = await options.within(pending);
        if (generation !== startGeneration) return denied();
        if (
          options.signal?.aborted ||
          identity !== snapshotKey(observe()) ||
          result.alias !== options.alias
        ) {
          invalidate();
          return denied();
        }
        if (options.operation === "qr.begin") {
          if (flows.size >= 16 || nextFlow >= 256) return denied();
          const flow = ++nextFlow;
          flows.set(flow, { alias: options.alias, generation, identity });
          return {
            evidence: "FIXTURE_ONLY",
            outcome: "PUBLISHED",
            value: result.value,
            flow,
          } as const;
        }
        if (options.operation === "qr.poll")
          flows.set(options.flow!, { alias: options.alias, generation, identity });
        return { evidence: "FIXTURE_ONLY", outcome: "PUBLISHED", value: result.value } as const;
      } catch {
        invalidate();
        return denied();
      }
    },
  };
}
