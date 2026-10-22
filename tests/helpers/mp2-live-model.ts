import { QR_FLOW_TTL_MS } from "../../src/bridge/qr/adapter.js";

// Executable SPECIFICATION, test-only. No live transport/adapter/CLI can invoke this model.
export interface FixtureBinding {
  readonly alias: string;
  readonly source: string;
  readonly build: string;
  readonly processCreation: string;
  readonly account: string;
  readonly epoch: string;
  readonly state: "connected" | "disconnected";
}
export async function modelOneApprovedAttempt(options: {
  readonly mode?: "Preflight" | "FixtureLive";
  readonly fixtureQrApproval?: boolean;
  readonly fixtureReadiness?: boolean;
  readonly expected: FixtureBinding;
  readonly observe: () => Promise<FixtureBinding>;
  readonly begin: () => Promise<void>;
  readonly poll: () => Promise<"waiting" | "connected">;
  readonly now: () => number;
  readonly wait: () => Promise<void>;
  readonly signal?: AbortSignal;
}) {
  const counts = { begin: 0, poll: 0 };
  const finish = (reason: string) => ({ evidence: "FIXTURE_ONLY", reason, counts: { ...counts } });
  if (
    options.mode !== "FixtureLive" ||
    options.fixtureQrApproval !== true ||
    options.fixtureReadiness !== true
  )
    return finish("NOT_EXECUTED_APPROVAL_OR_READINESS_ABSENT");
  const expected = Object.freeze({ ...options.expected });
  if (
    !expected.account ||
    !expected.epoch ||
    !expected.processCreation ||
    !expected.build ||
    !expected.alias ||
    !expected.source
  )
    return finish("STOP_UNKNOWN_IDENTITY");
  const expiry = options.now() + QR_FLOW_TTL_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let stopped = false;
  const stop = new Promise<never>((_, reject) => {
    abort = () => {
      stopped = true;
      reject(Error());
    };
    timer = setTimeout(abort, QR_FLOW_TTL_MS);
    options.signal?.addEventListener("abort", abort, { once: true });
  });
  const bounded = async <T>(run: () => Promise<T>) => {
    if (stopped || options.signal?.aborted || options.now() >= expiry) throw Error();
    return Promise.race([run(), stop]);
  };
  const check = async (completion = false) => {
    const actual = await bounded(options.observe);
    for (const key of ["alias", "source", "build", "processCreation", "account", "epoch"] as const)
      if (actual[key] !== expected[key]) throw Error();
    if (actual.state !== (completion ? "connected" : expected.state)) throw Error();
  };
  try {
    await check();
    await bounded(() => {
      counts.begin++;
      return options.begin();
    });
    await check();
    // Hard call cap additionally prevents a fake/static clock from creating an unbounded loop.
    for (let n = 0; n < 60; n++) {
      await bounded(options.wait);
      await check();
      const state = await bounded(() => {
        counts.poll++;
        return options.poll();
      });
      if (state !== "waiting" && state !== "connected") throw Error();
      await check(state === "connected");
      if (state === "connected") return finish("COMPLETED");
    }
    return finish("STOP_POLL_LIMIT");
  } catch {
    return finish("STOP_NO_RETRY_OR_RECOVERY");
  } finally {
    clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
  }
}
