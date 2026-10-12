import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectV2, sha256 } from "../src/fqgate/release/v2-inspection.js";
import { auditV2Archive, inspectWindowsZip } from "../src/fqgate/release/v2-archive.js";
import { FetchHttpTransport, type HttpRequestOptions } from "../src/fqgate/release/http.js";
import { runCli } from "../src/cli/main.js";
import { parseStableManifest, selectWindowsX64Package } from "../src/fqgate/release/manifest.js";
import { FqgateHealthProbe } from "../src/fqgate/health/probe.js";
import { FqgateInstrumentLookup } from "../src/fqgate/market/lookup.js";
import { CompatibilityPolicy } from "../src/fqgate/compatibility/policy.js";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`./fixtures/fqgate-v2/${name}.json`, import.meta.url));
}
function decode(bytes: Buffer): Record<string, unknown> {
  return JSON.parse(Buffer.from(JSON.parse(bytes.toString()).signed, "base64url").toString());
}
function wrap(payload: Record<string, unknown>, keyId = "unknown-key"): Buffer {
  return Buffer.from(
    JSON.stringify({
      keyId,
      signature: Buffer.alloc(64).toString("base64url"),
      signed: Buffer.from(JSON.stringify(payload)).toString("base64url"),
    }),
  );
}
function transport(modify?: (docs: Buffer[]) => void) {
  const docs = [fixture("freshness"), fixture("stable"), fixture("release"), fixture("github")];
  modify?.(docs);
  const request = vi.fn(async (url: string, options: HttpRequestOptions) => {
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("error");
    expect(options.maxBytes).toBe(65_536);
    const index = url.endsWith("freshness.json")
      ? 0
      : url.endsWith("stable.json")
        ? 1
        : url.endsWith("release.json")
          ? 2
          : 3;
    return { status: 200, headers: {}, body: docs[index]! };
  });
  return { request };
}
function relink(docs: Buffer[]) {
  const stable = decode(docs[1]!);
  stable.releaseSha256 = sha256(docs[2]!);
  docs[1] = wrap(stable);
  const freshness = decode(docs[0]!);
  freshness.stableSha256 = sha256(docs[1]!);
  docs[0] = wrap(freshness);
}

// Small stored ZIPs created solely in temporary directories; no executable runs.
function pe(): Buffer {
  const bytes = Buffer.alloc(128);
  bytes.write("MZ");
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x4550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  bytes.writeUInt16LE(0x20b, 88);
  return bytes;
}
interface ZipItem {
  name: string;
  data?: Buffer;
  mode?: number;
  size?: number;
  flags?: number;
  localName?: string;
  crc?: number;
}
function zip(items: ZipItem[]): Buffer {
  const locals: Buffer[] = [],
    centrals: Buffer[] = [];
  let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name),
      localName = Buffer.from(item.localName ?? item.name),
      data = item.data ?? pe();
    const crc = item.crc ?? crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(item.flags ?? 0, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(item.size ?? data.length, 22);
    local.writeUInt16LE(localName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(item.flags ?? 0, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(item.size ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((item.mode ?? 0x8000) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, localName, data);
    centrals.push(central, name);
    offset += local.length + localName.length + data.length;
  }
  const directory = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const required: ZipItem[] = [{ name: "FQGate.exe" }, { name: "fqgate-updater.exe" }];
const directories: string[] = [];
async function inspect(bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), "v2-test-"));
  directories.push(directory);
  const path = join(directory, "test.zip");
  await writeFile(path, bytes);
  return inspectWindowsZip(path);
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("v2 unauthenticated observation", () => {
  it("observes the real snapshot without qualifying it", async () => {
    const http = transport();
    const result = await inspectV2(http);
    expect(http.request).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      version: "2.0.4",
      sequence: 7,
      refreshSequence: 8,
      qualification: "BLOCKED",
      signatureVerified: false,
      installAllowed: false,
      runtimeQualified: false,
    });
  });
  it.each(["unknown", "update-release-signing-v2"])(
    "never trusts plausible signatures or keyId %s",
    async (keyId) => {
      const result = await inspectV2(
        transport((docs) => {
          docs[2] = wrap(decode(docs[2]!), keyId);
          relink(docs);
        }),
      );
      expect(result.installAllowed).toBe(false);
      expect(result.signatureVerified).toBe(false);
    },
  );
  it("never treats replayed unauthenticated sequence as anti-rollback approval", async () => {
    const result = await inspectV2(transport());
    expect(result.blockers).toContain("AUTHENTICATED_PERSISTENT_ANTI_ROLLBACK_UNIMPLEMENTED");
  });
  it.each([
    [
      "hash mismatch",
      (docs: Buffer[]) => {
        docs[1] = Buffer.from(docs[1]!.toString() + " ");
      },
    ],
    [
      "malformed signature",
      (docs: Buffer[]) => {
        docs[0] = Buffer.from(
          JSON.stringify({ ...JSON.parse(docs[0]!.toString()), signature: "bad=" }),
        );
      },
    ],
    [
      "unsafe pointer",
      (docs: Buffer[]) => {
        const f = decode(docs[0]!);
        f.stablePath = "../stable.json";
        docs[0] = wrap(f);
      },
    ],
    [
      "sequence mismatch",
      (docs: Buffer[]) => {
        const r = decode(docs[2]!);
        r.sequence = 6;
        docs[2] = wrap(r);
        relink(docs);
      },
    ],
    [
      "bad URL",
      (docs: Buffer[]) => {
        const r = decode(docs[2]!);
        const a = r.artifacts as Record<string, unknown>[];
        (a[0]!.downloadUrls as Record<string, unknown>).github = "https://evil.test/payload.zip";
        docs[2] = wrap(r);
        relink(docs);
      },
    ],
    [
      "missing updater declaration",
      (docs: Buffer[]) => {
        const r = decode(docs[2]!);
        (
          (r.artifacts as Record<string, unknown>[])[0]!.updatePayload as Record<string, unknown>
        ).requiredEntries = ["FQGate.exe"];
        docs[2] = wrap(r);
        relink(docs);
      },
    ],
    [
      "duplicate Windows",
      (docs: Buffer[]) => {
        const r = decode(docs[2]!);
        const a = r.artifacts as unknown[];
        a.push(a[0]);
        docs[2] = wrap(r);
        relink(docs);
      },
    ],
    [
      "oversize archive",
      (docs: Buffer[]) => {
        const r = decode(docs[2]!);
        (r.artifacts as Record<string, unknown>[])[0]!.bytes = 2 ** 30;
        docs[2] = wrap(r);
        relink(docs);
      },
    ],
    [
      "GitHub digest disagreement",
      (docs: Buffer[]) => {
        const a = JSON.parse(docs[3]!.toString());
        a.assets.find((v: { name: string }) => v.name.endsWith("windows-x64.zip")).digest =
          `sha256:${"0".repeat(64)}`;
        docs[3] = Buffer.from(JSON.stringify(a));
      },
    ],
  ] as const)("rejects %s", async (_name, change) => {
    await expect(inspectV2(transport(change))).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
  });
  it("rejects redirect responses", async () => {
    await expect(
      inspectV2({
        request: async () => ({
          status: 302,
          headers: { location: "https://evil.test" },
          body: Buffer.alloc(0),
        }),
      }),
    ).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
  });
  it("rejects bounded metadata overflow", async () => {
    await expect(
      inspectV2({
        request: async () => ({ status: 200, headers: {}, body: Buffer.alloc(65_537) }),
      }),
    ).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
  });
  it("keeps v1.0.5 executable selection and v2 range exclusion", () => {
    const release = parseStableManifest(
      JSON.parse(readFileSync(new URL("./fixtures/stable-manifest.json", import.meta.url), "utf8")),
    );
    const v1 = { ...release, version: "1.0.5" };
    expect(selectWindowsX64Package(v1).installMode).toBe("replaceExecutable");
    expect(() =>
      selectWindowsX64Package({
        ...v1,
        packages: [
          { ...v1.packages[0]!, installMode: "replaceApplication", fileName: "payload.zip" },
        ],
      }),
    ).toThrow();
    const policy = new CompatibilityPolicy({
      supportedRange: ">=1.0.0 <2.0.0",
      validatedVersions: ["1.0.5"],
    });
    expect(policy.evaluate("1.0.5").validated).toBe(true);
    expect(() => policy.assertSupported("2.0.4")).toThrow();
  });
  it.each(["--apply", "--dry-run", "--config", "--url", "--force"])(
    "rejects v2 mutation/unrelated flag %s before network/config",
    async (flag) => {
      const spy = vi.spyOn(FetchHttpTransport.prototype, "request");
      const io = { stdout: vi.fn(), stderr: vi.fn() };
      expect(await runCli(["fqgate", "inspect-v2", flag, "--json"], io)).not.toBe(0);
      expect(spy).not.toHaveBeenCalled();
    },
  );
});

describe("non-executing ZIP audit", () => {
  it("consumes bounded entries and required PE headers", async () => {
    expect(await inspect(zip(required))).toMatchObject({
      entries: 2,
      uncompressedBytes: 256,
      requiredPeHeaders: "PASS",
    });
  });
  it.each([
    "../evil.exe",
    "/evil.exe",
    "C:/evil.exe",
    "dir\\evil.exe",
    "con.txt",
    "a./evil.exe",
    "a//evil.exe",
    "a/../evil.exe",
    "evil.exe:stream",
  ])("rejects Windows unsafe path %s", async (name) => {
    await expect(inspect(zip([...required, { name }]))).rejects.toThrow();
  });
  it.each([
    ["duplicate", [...required, required[0]!]],
    ["case alias", [...required, { name: "fqgate.EXE" }]],
    ["file parent conflict", [...required, { name: "FQGate.exe/evil" }]],
    ["reverse parent conflict", [{ name: "a/b" }, { name: "a" }, ...required]],
    ["symlink", [...required, { name: "link", mode: 0xa000 }]],
    ["special file", [...required, { name: "device", mode: 0x2000 }]],
    ["encrypted", [...required, { name: "encrypted", flags: 1 }]],
    ["local name mismatch", [...required, { name: "safe", localName: "evil" }]],
    ["size lie", [...required, { name: "oversize", size: 2 ** 30 }]],
    ["CRC mismatch", [...required, { name: "bad-crc", crc: 0 }]],
    ["missing updater", [required[0]!]],
    [
      "invalid updater",
      [required[0]!, { name: "fqgate-updater.exe", data: Buffer.from("not a PE") }],
    ],
    [
      "too many entries",
      [...required, ...Array.from({ length: 511 }, (_, i) => ({ name: `extra-${i}` }))],
    ],
  ] as const)("rejects %s", async (_name, items) => {
    await expect(inspect(zip([...items]))).rejects.toThrow();
  });
  it("rejects interrupted/truncated archive", async () => {
    await expect(inspect(zip(required).subarray(0, 90))).rejects.toThrow();
  });
  it.each([
    "https://evil.test/archive",
    "http://release-assets.githubusercontent.com/github-production-release-asset/a",
    "https://user@release-assets.githubusercontent.com/github-production-release-asset/a",
  ])("rejects archive redirect %s", async (location) => {
    const metadata = transport();
    const http = {
      request: async (url: string, options: HttpRequestOptions) =>
        url.endsWith(".zip")
          ? { status: 302, headers: { location }, body: Buffer.alloc(0) }
          : metadata.request(url, options),
    };
    await expect(auditV2Archive(http)).rejects.toThrow();
    expect(metadata.request).toHaveBeenCalledTimes(4);
  });
  it("rejects archive size/hash mismatch before staging", async () => {
    const metadata = transport();
    const http = {
      request: async (url: string, options: HttpRequestOptions) =>
        url.endsWith(".zip")
          ? { status: 200, headers: {}, body: zip(required) }
          : metadata.request(url, options),
    };
    await expect(auditV2Archive(http)).rejects.toThrow();
  });
});

describe("qualification and runtime isolation", () => {
  it("rejects unsupported v2 before querying or reading OpenAPI", async () => {
    const request = vi.fn(),
      contract = vi.fn();
    const adapter = new FqgateInstrumentLookup({
      http: { request },
      contract,
      runtime: async () => ({
        version: "2.0.4",
        supported: false,
        validated: false,
        operationEvidence: [],
        running: true,
      }),
    });
    await expect(adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "FQGATE_INCOMPATIBLE",
    });
    expect(request).not.toHaveBeenCalled();
    expect(contract).not.toHaveBeenCalled();
  });
  it("preserves healthy L1 when L2 is unavailable without qualifying a runtime", async () => {
    const health = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: {
        request: async () => ({
          status: 200,
          headers: {},
          body: Buffer.from(
            JSON.stringify({
              code: 0,
              message: "ok",
              data: { network_ready: true, connected: true, level2_permission: false },
            }),
          ),
        }),
      },
    });
    expect(await health.probe()).toMatchObject({
      available: true,
      validPayload: true,
      connected: true,
      level2Permission: false,
    });
  });
  it.each([429, 503, 504])("fails closed on HTTP %s health", async (status) => {
    const health = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: { request: async () => ({ status, headers: {}, body: Buffer.alloc(0) }) },
    });
    expect(await health.probe()).toMatchObject({
      available: false,
      validPayload: false,
      httpStatus: status,
    });
  });
  it("fails closed on health timeout", async () => {
    const health = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: {
        request: async () => {
          throw new Error("timeout");
        },
      },
    });
    expect(await health.probe()).toMatchObject({ available: false, validPayload: false });
  });
});

function archiveTransport(bytes: Buffer, moving = false) {
  const metadata = transport((docs) => {
    const release = decode(docs[2]!);
    const asset = (release.artifacts as Record<string, unknown>[])[0]!;
    asset.bytes = bytes.length;
    asset.sha256 = sha256(bytes);
    docs[2] = wrap(release);
    relink(docs);
    const github = JSON.parse(docs[3]!.toString());
    const githubAsset = github.assets.find((a: { name: string }) =>
      a.name.endsWith("windows-x64.zip"),
    );
    githubAsset.size = bytes.length;
    githubAsset.digest = `sha256:${sha256(bytes)}`;
    docs[3] = Buffer.from(JSON.stringify(github));
  });
  let downloaded = false;
  return {
    request: async (url: string, options: HttpRequestOptions) => {
      if (url.endsWith(".zip")) {
        downloaded = true;
        return { status: 200, headers: {}, body: bytes };
      }
      const result = await metadata.request(url, options);
      if (moving && downloaded && url.endsWith("freshness.json")) {
        const fresh = decode(Buffer.from(result.body));
        fresh.refreshSequence = 9;
        return { ...result, body: wrap(fresh) };
      }
      return result;
    },
  };
}
describe("isolated audit cleanup", () => {
  it("cleans up after successful audit and still blocks installation", async () => {
    const before = (await readdir(tmpdir())).filter((n) => n.startsWith("fqgate-v2-audit-"));
    expect(await auditV2Archive(archiveTransport(zip(required)))).toMatchObject({
      cleanup: "REMOVED",
      installAllowed: false,
      signatureVerified: false,
      archive: { entries: 2 },
    });
    expect((await readdir(tmpdir())).filter((n) => n.startsWith("fqgate-v2-audit-"))).toEqual(
      before,
    );
  });
  it.each([false, true])("cleans up on invalid archive or moving metadata (%s)", async (moving) => {
    const before = (await readdir(tmpdir())).filter((n) => n.startsWith("fqgate-v2-audit-"));
    await expect(
      auditV2Archive(archiveTransport(zip(moving ? required : [required[0]!]), moving)),
    ).rejects.toThrow();
    expect((await readdir(tmpdir())).filter((n) => n.startsWith("fqgate-v2-audit-"))).toEqual(
      before,
    );
  });
});
