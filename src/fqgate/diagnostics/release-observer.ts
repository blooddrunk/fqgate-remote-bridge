import { inspectV2, record, sha256, v2Invalid } from "../release/v2-inspection.js";
import type { HttpTransport } from "../release/http.js";
import { parseStableManifest } from "../release/manifest.js";

const API = "https://api.github.com/repos/fqgate/";
const RAW = "https://raw.githubusercontent.com/fqgate/FQGate-releases/";
const VERSION = /^2\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$(?![\s\S])/;
const HASH = /^[a-f0-9]{64}$(?![\s\S])/;

export interface ObservationBaseline {
  readonly version: string;
  readonly sequence: number;
  readonly refreshSequence: number;
  readonly releaseHash: string;
  readonly stableHash: string;
  readonly freshnessHash: string;
}
export function parseObservationBaseline(value: unknown): ObservationBaseline {
  const b = record(value);
  if (
    Object.keys(b).sort().join(",") !==
      "freshnessHash,refreshSequence,releaseHash,sequence,stableHash,version" ||
    typeof b.version !== "string" ||
    !VERSION.test(b.version) ||
    ![b.sequence, b.refreshSequence].every(
      (n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0,
    ) ||
    ![b.releaseHash, b.stableHash, b.freshnessHash].every(
      (h) => typeof h === "string" && HASH.test(h),
    )
  )
    throw v2Invalid();
  return b as unknown as ObservationBaseline;
}
export function compareObservedVersions(a: string, b: string): number {
  if (!VERSION.test(a) || !VERSION.test(b)) throw v2Invalid();
  const left = a.split(".").map(Number),
    right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! > right[i]! ? 1 : -1;
  return 0;
}
function json(bytes: Uint8Array): Record<string, unknown> {
  return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function release(value: Record<string, unknown>, repo: string) {
  const tag = value.tag_name;
  if (
    typeof tag !== "string" ||
    !tag.startsWith("fqgate-v") ||
    !VERSION.test(tag.slice(8)) ||
    value.draft !== false ||
    value.prerelease !== false ||
    value.html_url !== `https://github.com/fqgate/${repo}/releases/tag/${tag}` ||
    typeof value.published_at !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value.published_at) ||
    !Number.isFinite(Date.parse(value.published_at)) ||
    new Date(value.published_at).toISOString() !== value.published_at.replace("Z", ".000Z") ||
    !Array.isArray(value.assets) ||
    value.assets.length > 64
  )
    throw v2Invalid();
  return { version: tag.slice(8), publishedAt: value.published_at, url: value.html_url };
}

/** Standalone observation only. No runtime, lifecycle, config, credentials or persistent ledger. */
export async function observeReleases(
  http: HttpTransport,
  options: {
    readonly nowMs?: () => number;
    readonly baseline?: ObservationBaseline;
  } = {},
) {
  const now = options.nowMs ?? Date.now;
  const started = now(),
    deadline = started + 120_000;
  const receipts: { url: string; bytes: number; sha256: string }[] = [];
  try {
    const get = async (url: string): Promise<Uint8Array> => {
      if (!(
        new RegExp(
          `^${API.replaceAll(".", "\\.")}(FQGate-releases|FQGate-agent)/(releases/(latest|tags/fqgate-v2\\.[0-9]{1,6}\\.[0-9]{1,6})|commits/main)$`,
        ).test(url) ||
        new RegExp(
          `^${RAW.replaceAll(".", "\\.")}[a-f0-9]{40}/releases/(stable\\.json|v2/(freshness\\.json|[1-9][0-9]{0,14}/stable\\.json|2\\.[0-9]{1,6}\\.[0-9]{1,6}/release\\.json))$`,
        ).test(url)
      ))
        throw v2Invalid();
      const remaining = deadline - now();
      if (remaining <= 0 || receipts.length >= 12) throw v2Invalid();
      const r = await http.request(url, {
        method: "GET",
        redirect: "error",
        timeoutMs: Math.min(15_000, remaining),
        maxBytes: 65_536,
      });
      if (r.status !== 200 || r.body.byteLength > 65_536 || now() >= deadline) throw v2Invalid();
      receipts.push({ url, bytes: r.body.byteLength, sha256: sha256(r.body) });
      return r.body;
    };
    const app = json(await get(`${API}FQGate-releases/releases/latest`));
    const agent = json(await get(`${API}FQGate-agent/releases/latest`));
    const appRelease = release(app, "FQGate-releases"),
      agentRelease = release(agent, "FQGate-agent");
    if (appRelease.version !== agentRelease.version) throw v2Invalid();
    const commit = json(await get(`${API}FQGate-releases/commits/main`)).sha;
    if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit)) throw v2Invalid();
    const legacyPath = `${RAW}${commit}/releases/stable.json`;
    const legacy = parseStableManifest(json(await get(legacyPath)));
    if (!/^1\.[0-9]+\.[0-9]+$/.test(legacy.version)) throw v2Invalid();
    const scoped: HttpTransport = {
      request: async (url) => ({
        status: 200,
        headers: {},
        body: await get(
          url.startsWith(`${RAW}main/`) ? url.replace(`${RAW}main/`, `${RAW}${commit}/`) : url,
        ),
      }),
    };
    const v2 = await inspectV2(scoped);
    if (
      v2.version !== appRelease.version ||
      Date.parse(appRelease.publishedAt) !== Date.parse(v2.publishedAt) ||
      Date.parse(appRelease.publishedAt) > started ||
      Date.parse(agentRelease.publishedAt) > started ||
      Date.parse(v2.publishedAt) > started
    )
      throw v2Invalid();
    const checkAsset = (doc: Record<string, unknown>, repo: string) => {
      const matches = (doc.assets as unknown[])
        .map(record)
        .filter((a) => a.name === v2.windows.fileName);
      if (
        matches.length !== 1 ||
        matches[0]!.size !== v2.windows.bytes ||
        matches[0]!.digest !== `sha256:${v2.windows.sha256}` ||
        matches[0]!.browser_download_url !==
          `https://github.com/fqgate/${repo}/releases/download/fqgate-v${v2.version}/${v2.windows.fileName}`
      )
        throw v2Invalid();
    };
    checkAsset(app, "FQGate-releases");
    checkAsset(agent, "FQGate-agent");
    // Recheck both moving latest pointers. Immutable manifests stay bound to one commit.
    for (const repo of ["FQGate-releases", "FQGate-agent"] as const) {
      const latest = json(await get(`${API}${repo}/releases/latest`));
      const again = release(latest, repo);
      checkAsset(latest, repo);
      if (
        again.version !== v2.version ||
        again.publishedAt !== (repo === "FQGate-releases" ? appRelease : agentRelease).publishedAt
      )
        throw v2Invalid();
    }
    const baseline = parseObservationBaseline({
      version: v2.version,
      sequence: v2.sequence,
      refreshSequence: v2.refreshSequence,
      releaseHash: v2.metadataHashes.release,
      stableHash: v2.metadataHashes.stable,
      freshnessHash: v2.metadataHashes.freshness,
    });
    let change: "INITIAL_REVIEW_REQUIRED" | "UNCHANGED_UNAUTHENTICATED" | "HUMAN_REVIEW_REQUIRED" =
      "INITIAL_REVIEW_REQUIRED";
    if (options.baseline) {
      const before = parseObservationBaseline(options.baseline);
      const versionDelta = compareObservedVersions(baseline.version, before.version);
      if (
        versionDelta < 0 ||
        baseline.sequence < before.sequence ||
        baseline.refreshSequence < before.refreshSequence ||
        (baseline.sequence === before.sequence &&
          (baseline.version !== before.version ||
            baseline.releaseHash !== before.releaseHash ||
            baseline.stableHash !== before.stableHash)) ||
        (baseline.refreshSequence === before.refreshSequence &&
          baseline.freshnessHash !== before.freshnessHash) ||
        (versionDelta > 0 && baseline.sequence <= before.sequence)
      )
        throw v2Invalid();
      change = "HUMAN_REVIEW_REQUIRED";
      // Key ordering cannot affect the decision.
      if (
        Object.keys(baseline).every(
          (k) =>
            baseline[k as keyof ObservationBaseline] === before[k as keyof ObservationBaseline],
        )
      )
        change = "UNCHANGED_UNAUTHENTICATED";
    }
    return {
      status: "RELEASE_OBSERVED",
      observedAt: new Date(started).toISOString(),
      sourceCommit: commit,
      channel: "stable-v2",
      legacy: { version: legacy.version, manifestUrl: legacyPath },
      releases: { application: appRelease, agent: agentRelease },
      manifestPaths: {
        freshness: "releases/v2/freshness.json",
        stable: `releases/v2/${v2.sequence}/stable.json`,
        release: `releases/v2/${v2.version}/release.json`,
      },
      ...v2,
      baseline,
      change,
      replayProtection: "UNAUTHENTICATED_COMPARISON_ONLY",
      compatibility: "UNKNOWN",
      production: "NO_GO",
      receipts,
    };
  } catch {
    throw v2Invalid();
  }
}
