import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  observeReleases,
  compareObservedVersions,
  parseObservationBaseline,
} from "../src/fqgate/diagnostics/release-observer.js";
import { sha256 } from "../src/fqgate/release/v2-inspection.js";
import type { HttpRequestOptions } from "../src/fqgate/release/http.js";

const frozen = Date.parse("2026-11-06T00:00:00Z");
function fixture() {
  const docs = Object.fromEntries(
    ["application", "agent", "commit", "legacy", "freshness", "stable", "release", "tag"].map(
      (n) => [n, readFileSync(new URL(`./fixtures/fqgate-mp7/${n}.json`, import.meta.url))],
    ),
  );
  const request = vi.fn(async (url: string, o: HttpRequestOptions) => {
    expect(o).toMatchObject({ method: "GET", redirect: "error", maxBytes: 65536 });
    expect(o.timeoutMs).toBeGreaterThan(0);
    expect(o.timeoutMs).toBeLessThanOrEqual(15000);
    expect(o.headers).toBeUndefined();
    expect(o.body).toBeUndefined();
    const key = url.endsWith("commits/main")
      ? "commit"
      : url.includes("/releases/tags/")
        ? "tag"
        : url.endsWith("releases/latest")
          ? url.includes("FQGate-agent")
            ? "agent"
            : "application"
          : url.endsWith("/v2/freshness.json")
            ? "freshness"
            : /\/v2\/\d+\/stable.json$/.test(url)
              ? "stable"
              : url.endsWith("release.json")
                ? "release"
                : "legacy";
    return { status: 200, headers: {}, body: docs[key]! };
  });
  return { docs, request };
}
function edit(
  f: ReturnType<typeof fixture>,
  name: string,
  fn: (d: Record<string, unknown>) => void,
  signed = false,
) {
  const d = JSON.parse(f.docs[name]!.toString());
  const payload = signed ? JSON.parse(Buffer.from(d.signed, "base64url").toString()) : d;
  fn(payload);
  if (signed) d.signed = Buffer.from(JSON.stringify(payload)).toString("base64url");
  f.docs[name] = Buffer.from(JSON.stringify(d));
}
function relink(f: ReturnType<typeof fixture>) {
  edit(
    f,
    "stable",
    (d) => {
      d.releaseSha256 = sha256(f.docs.release!);
    },
    true,
  );
  edit(
    f,
    "freshness",
    (d) => {
      d.stableSha256 = sha256(f.docs.stable!);
    },
    true,
  );
}
const observe = (f: ReturnType<typeof fixture>) => observeReleases(f, { nowMs: () => frozen });
describe("MP-7 standalone release observation", () => {
  it("pins both official releases and immutable manifests; never qualifies or leaks notes", async () => {
    const f = fixture();
    edit(f, "application", (d) => {
      d.body = "credential-secret";
      d.arbitrary = "secret";
    });
    const r = await observe(f);
    expect(r).toMatchObject({
      status: "RELEASE_OBSERVED",
      version: "2.0.7",
      sequence: 10,
      refreshSequence: 11,
      legacy: { version: "1.0.5" },
      change: "INITIAL_REVIEW_REQUIRED",
      signatureVerified: false,
      installAllowed: false,
      runtimeQualified: false,
      compatibility: "UNKNOWN",
      production: "NO_GO",
    });
    expect(r.windows).toMatchObject({
      bytes: 32181584,
      sha256: "6a6a43aea7380cd5e3c5c6f6e271140d78bb3a978a8711e2d0a4f64dfe253dcf",
    });
    expect(f.request).toHaveBeenCalledTimes(10);
    expect(JSON.stringify(r)).not.toContain("credential-secret");
    expect(
      f.request.mock.calls
        .filter(([u]) => u.includes("raw.githubusercontent"))
        .every(([u]) => u.includes(r.sourceCommit)),
    ).toBe(true);
    const again = await observeReleases(f, { nowMs: () => frozen, baseline: r.baseline });
    expect(again.change).toBe("UNCHANGED_UNAUTHENTICATED");
    const older = { ...r.baseline, version: "2.0.6", sequence: 9, refreshSequence: 10 };
    expect((await observeReleases(f, { nowMs: () => frozen, baseline: older })).change).toBe(
      "HUMAN_REVIEW_REQUIRED",
    );
  });
  it("reuses observation for future 2.0.8 without qualification", async () => {
    const f = fixture();
    for (const n of ["application", "agent", "tag"])
      edit(f, n, (d) => {
        Object.assign(d, JSON.parse(JSON.stringify(d).replaceAll("2.0.7", "2.0.8")));
      });
    for (const n of ["release", "stable"])
      edit(
        f,
        n,
        (d) => {
          Object.assign(d, JSON.parse(JSON.stringify(d).replaceAll("2.0.7", "2.0.8")));
          d.sequence = 11;
        },
        true,
      );
    edit(
      f,
      "freshness",
      (d) => {
        d.refreshSequence = 12;
        d.stablePath = "11/stable.json";
      },
      true,
    );
    relink(f);
    expect(await observe(f)).toMatchObject({
      version: "2.0.8",
      installAllowed: false,
      runtimeQualified: false,
    });
  });
  it.each([
    [
      "missing signature",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "freshness", (d) => {
          delete d.signature;
        }),
    ],
    [
      "unsupported envelope",
      (f: ReturnType<typeof fixture>) =>
        edit(
          f,
          "release",
          (d) => {
            d.schemaVersion = 2;
          },
          true,
        ),
    ],
    [
      "tampered hash",
      (f: ReturnType<typeof fixture>) => {
        f.docs.stable = Buffer.from(f.docs.stable!.toString() + " ");
      },
    ],
    [
      "path escape",
      (f: ReturnType<typeof fixture>) =>
        edit(
          f,
          "freshness",
          (d) => {
            d.stablePath = "../stable.json";
          },
          true,
        ),
    ],
    [
      "channel drift",
      (f: ReturnType<typeof fixture>) =>
        edit(
          f,
          "stable",
          (d) => {
            d.channel = "preview";
          },
          true,
        ),
    ],
    [
      "repository spoof",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "application", (d) => {
          d.html_url = "https://evil.test/";
        }),
    ],
    [
      "draft",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "application", (d) => {
          d.draft = true;
        }),
    ],
    [
      "prerelease",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "agent", (d) => {
          d.prerelease = true;
        }),
    ],
    [
      "release discrepancy",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "agent", (d) => {
          d.tag_name = "fqgate-v2.0.8";
          d.html_url = String(d.html_url).replace("2.0.7", "2.0.8");
        }),
    ],
    [
      "asset mismatch",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "agent", (d) => {
          (d.assets as Record<string, unknown>[])[0]!.size = 1;
        }),
    ],
    [
      "duplicate asset",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "agent", (d) => {
          (d.assets as unknown[]).push((d.assets as unknown[])[0]);
        }),
    ],
    [
      "metadata overflow",
      (f: ReturnType<typeof fixture>) => {
        f.docs.application = Buffer.alloc(65537);
      },
    ],
    [
      "malformed JSON",
      (f: ReturnType<typeof fixture>) => {
        f.docs.release = Buffer.from("{secret");
      },
    ],
    [
      "malformed UTF8",
      (f: ReturnType<typeof fixture>) => {
        f.docs.commit = Buffer.from([255]);
      },
    ],
    [
      "future publication",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "agent", (d) => {
          d.published_at = "2099-01-01T00:00:00Z";
        }),
    ],
    [
      "legacy confusion",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "legacy", (d) => {
          d.version = "2.0.7";
        }),
    ],
    [
      "bad commit",
      (f: ReturnType<typeof fixture>) =>
        edit(f, "commit", (d) => {
          d.sha = "main/../../evil";
        }),
    ],
  ] as const)("fails closed with no raw error on %s", async (_name, change) => {
    const f = fixture();
    change(f);
    await expect(observe(f)).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
  });
  it.each([302, 404, 503])("never follows redirects/retries status %s", async (status) => {
    const request = vi.fn(async () => ({
      status,
      headers: { location: "https://evil.test" },
      body: Buffer.from("secret"),
    }));
    await expect(observeReleases({ request })).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("redacts transport failures and stops at overall time budget", async () => {
    const r = observeReleases({
      request: async () => {
        throw Error("secret URL and token");
      },
    }).catch((e) => e);
    expect(JSON.stringify(await r)).not.toContain("secret");
    const f = fixture();
    let n = 0;
    await expect(
      observeReleases(f, { nowMs: () => frozen + (n++ ? 120001 : 0) }),
    ).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  });
  it("detects latest changing during collection", async () => {
    const f = fixture();
    const request = async (u: string, o: HttpRequestOptions) => {
      const r = await f.request(u, o);
      if (f.request.mock.calls.length === 9) return { ...r, body: Buffer.from("{}") };
      return r;
    };
    await expect(observeReleases({ request }, { nowMs: () => frozen })).rejects.toThrow();
  });
  it("rejects an asset changing under the same latest version", async () => {
    const f = fixture();
    const request = async (url: string, o: HttpRequestOptions) => {
      const r = await f.request(url, o);
      if (f.request.mock.calls.length === 9) {
        const d = JSON.parse(Buffer.from(r.body).toString());
        d.assets[0].size++;
        return { ...r, body: Buffer.from(JSON.stringify(d)) };
      }
      return r;
    };
    await expect(observeReleases({ request }, { nowMs: () => frozen })).rejects.toThrow();
  });
  it("rejects API and manifest publication-time disagreement", async () => {
    const f = fixture();
    edit(f, "application", (d) => {
      d.published_at = "2026-10-30T03:03:54Z";
    });
    await expect(observe(f)).rejects.toThrow();
  });
  it.each([
    "version",
    "sequence",
    "refreshSequence",
    "releaseHash",
    "stableHash",
    "freshnessHash",
  ] as const)("rejects rollback/replay or equivocation of %s", async (field) => {
    const f = fixture(),
      r = await observe(f);
    const baseline = { ...r.baseline };
    if (field === "version") baseline.version = "2.0.8";
    else if (field === "sequence" || field === "refreshSequence") baseline[field]++;
    else baseline[field] = "a".repeat(64);
    await expect(observeReleases(f, { nowMs: () => frozen, baseline })).rejects.toThrow();
  });
  it.each(["2.0.8", "2.0.10", "2.1.0", "2.100.999"])(
    "compares future stable %s numerically",
    (v) => {
      expect(compareObservedVersions(v, "2.0.7")).toBe(1);
      expect(compareObservedVersions("2.0.7", v)).toBe(-1);
    },
  );
  it.each(["2.0.08", "3.0.0", "2.0.8-rc1", "v2.0.8", "2.0.9999999", "2.0.7\n"])(
    "rejects unsupported version %s",
    (v) => expect(() => compareObservedVersions(v, "2.0.7")).toThrow(),
  );
  it.each([null, {}, { version: "2.0.7", secret: "do-not-log" }])(
    "rejects invalid caller baseline %#",
    (b) => expect(() => parseObservationBaseline(b)).toThrow(),
  );
});
