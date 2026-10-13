import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open, type Entry, type ZipFile } from "yauzl";
import type { HttpTransport } from "./http.js";
import { inspectV2, record, sha256, v2Invalid, type V2Inspection } from "./v2-inspection.js";

const MAX_ENTRIES = 512;
const MAX_FILE_BYTES = 134_217_728;
const MAX_TOTAL_BYTES = 268_435_456;

function safeName(entry: Entry): string {
  const name = entry.fileName;
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (mode !== 0 && mode !== 0x8000 && mode !== 0x4000) throw v2Invalid();
  if (entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod))
    throw v2Invalid();
  if (
    name.length > 240 ||
    !/^[A-Za-z0-9_.\-/]+$/.test(name) ||
    name.startsWith("/") ||
    name.includes("\\")
  )
    throw v2Invalid();
  const parts = name.replace(/\/$/, "").split("/");
  if (
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
    )
  )
    throw v2Invalid();
  if ((mode === 0x4000) !== name.endsWith("/") && mode !== 0) throw v2Invalid();
  return parts.join("/").toLowerCase();
}

/** Structural PE check only. It never proves publisher authenticity or updater behavior. */
function assertPe(prefix: Buffer): void {
  if (prefix.length < 64 || prefix.toString("ascii", 0, 2) !== "MZ") throw v2Invalid();
  const offset = prefix.readUInt32LE(0x3c);
  if (
    offset < 64 ||
    offset + 26 > prefix.length ||
    prefix.readUInt32LE(offset) !== 0x00004550 ||
    prefix.readUInt16LE(offset + 4) !== 0x8664 ||
    prefix.readUInt16LE(offset + 24) !== 0x20b
  )
    throw v2Invalid();
}

export async function inspectWindowsZip(path: string): Promise<{
  entries: number;
  uncompressedBytes: number;
  requiredPeHeaders: "PASS";
  files: readonly { path: string; bytes: number }[];
}> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    open(
      path,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false },
      (error, value) => {
        if (error || !value) reject(v2Invalid());
        else resolve(value);
      },
    );
  });
  return new Promise((resolve, reject) => {
    let entries = 0;
    let total = 0;
    let finished = false;
    let activeStream: Readable | undefined;
    const names = new Map<string, boolean>();
    const files: { path: string; bytes: number }[] = [];
    const ranges: { start: number; end: number }[] = [];
    const required = new Set(["FQGate.exe", "fqgate-updater.exe"]);
    const deadline = setTimeout(() => fail(), 60_000);
    function fail(): void {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      activeStream?.destroy();
      zip.close();
      reject(v2Invalid());
    }
    zip.on("error", fail);
    zip.on("entry", (entry: Entry) => {
      void (async () => {
        const name = safeName(entry);
        const directory = entry.fileName.endsWith("/");
        entries++;
        total += entry.uncompressedSize;
        if (
          entries > MAX_ENTRIES ||
          entry.uncompressedSize > MAX_FILE_BYTES ||
          total > MAX_TOTAL_BYTES ||
          names.has(name)
        )
          throw v2Invalid();
        for (const [prior, isDirectory] of names) {
          if (
            (!isDirectory && name.startsWith(`${prior}/`)) ||
            (!directory && prior.startsWith(`${name}/`))
          )
            throw v2Invalid();
        }
        names.set(name, directory);
        files.push({ path: entry.fileName, bytes: entry.uncompressedSize });
        const local = await zip.readLocalFileHeaderPromise(entry);
        const range = {
          start: entry.relativeOffsetOfLocalHeader,
          end: local.fileDataStart + entry.compressedSize,
        };
        if (
          local.fileName.toString("utf8") !== entry.fileName ||
          local.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
          local.compressionMethod !== entry.compressionMethod ||
          ranges.some((prior) => range.start < prior.end && prior.start < range.end)
        )
          throw v2Invalid();
        if (
          !(entry.generalPurposeBitFlag & 8) &&
          (local.crc32 !== entry.crc32 ||
            local.compressedSize !== entry.compressedSize ||
            local.uncompressedSize !== entry.uncompressedSize)
        )
          throw v2Invalid();
        ranges.push(range);
        if (directory) {
          if (entry.uncompressedSize !== 0) throw v2Invalid();
          zip.readEntry();
          return;
        }
        const stream = await new Promise<Readable>((res, rej) => {
          zip.openReadStream(entry, (error, value) => {
            if (error || !value) rej(v2Invalid());
            else res(value);
          });
        });
        activeStream = stream;
        let actual = 0;
        let crc = 0;
        let prefix = Buffer.alloc(0);
        for await (const value of stream) {
          const chunk = value as Buffer;
          actual += chunk.length;
          crc = crc32(chunk, crc);
          if (actual > entry.uncompressedSize || actual > MAX_FILE_BYTES || finished) {
            stream.destroy();
            throw v2Invalid();
          }
          if (prefix.length < 4096)
            prefix = Buffer.concat([prefix, chunk.subarray(0, 4096 - prefix.length)]);
        }
        activeStream = undefined;
        if (actual !== entry.uncompressedSize || crc !== entry.crc32) throw v2Invalid();
        if (required.has(entry.fileName)) {
          assertPe(prefix);
          required.delete(entry.fileName);
        }
        if (!finished) zip.readEntry();
      })().catch(fail);
    });
    zip.on("end", () => {
      if (finished) return;
      if (required.size !== 0 || entries === 0) {
        fail();
        return;
      }
      finished = true;
      clearTimeout(deadline);
      zip.close();
      resolve({ entries, uncompressedBytes: total, requiredPeHeaders: "PASS", files });
    });
    zip.readEntry();
  });
}

function allowedCdn(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "release-assets.githubusercontent.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.startsWith("/github-production-release-asset/")
    );
  } catch {
    return false;
  }
}

/** Fresh isolated temporary directory; no extraction or executable/process port exists. */
export async function auditV2Archive(
  http: HttpTransport,
): Promise<
  V2Inspection & { archive: Awaited<ReturnType<typeof inspectWindowsZip>>; cleanup: "REMOVED" }
> {
  const observation = await inspectV2(http);
  const options = {
    method: "GET" as const,
    redirect: "manual" as const,
    timeoutMs: 60_000,
    maxBytes: observation.windows.bytes + 1,
  };
  let response = await http.request(observation.windows.assetUrl, options);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.location;
    if (!location || !allowedCdn(location)) throw v2Invalid();
    response = await http.request(location, { ...options, redirect: "error" });
  }
  if (
    response.status !== 200 ||
    response.body.length !== observation.windows.bytes ||
    sha256(response.body) !== observation.windows.sha256
  )
    throw v2Invalid();
  const directory = await mkdtemp(join(tmpdir(), "fqgate-v2-audit-"));
  let archive;
  try {
    const path = join(directory, "untrusted.zip");
    await writeFile(path, response.body, { flag: "wx", mode: 0o600 });
    archive = await inspectWindowsZip(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  // Re-observe after download/audit; reject a moving metadata snapshot.
  const after = await inspectV2(http);
  if (
    JSON.stringify(record(after.metadataHashes)) !==
    JSON.stringify(record(observation.metadataHashes))
  )
    throw v2Invalid();
  return { ...observation, archive, cleanup: "REMOVED" };
}
