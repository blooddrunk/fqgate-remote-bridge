import process from "node:process";
import console from "node:console";
import { lstat, open, readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import yauzl from "yauzl";
import { compareBytes, inspectBytes, sha256 } from "./lib/mp11-static.mjs";

// No application/config/lifecycle imports, output files, network or child processes.
const pins = JSON.parse(
  await readFile(new URL("../docs/compatibility/fqgate-mp11-static-pins.json", import.meta.url)),
);
async function readBounded(path, size) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== size) throw Error();
  const file = await open(path, "r");
  try {
    const opened = await file.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== size) throw Error();
    const data = Buffer.alloc(size);
    let count = 0;
    while (count < size) {
      const { bytesRead } = await file.read(data, count, size - count, count);
      if (!bytesRead) throw Error();
      count += bytesRead;
    }
    const after = await file.stat();
    if (after.size !== size || after.mtimeMs !== opened.mtimeMs) throw Error();
    return data;
  } finally {
    await file.close();
  }
}
async function executableFromPinnedArchive(path) {
  const bytes = await readBounded(path, pins.archive207.bytes);
  if (sha256(bytes) !== pins.archive207.sha256) throw Error();
  // Reuse MP-7's exact audited ZIP. Only one exact member is streamed into memory.
  // No archive path is materialized; unrelated members are never decompressed.
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(Error());
      let result,
        count = 0;
      const fail = () => {
        zip.close();
        reject(Error());
      };
      zip.on("error", fail);
      zip.on("end", () => (result && count === 10 ? resolve(result) : reject(Error())));
      zip.on("entry", (entry) => {
        if (++count > 10) return fail();
        if (entry.fileName !== "FQGate.exe") return zip.readEntry();
        if (result || entry.uncompressedSize !== pins.versions["2.0.7"].bytes) return fail();
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return fail();
          const parts = [];
          let size = 0;
          stream.on("error", fail);
          stream.on("data", (chunk) => {
            size += chunk.length;
            if (size > entry.uncompressedSize) {
              stream.destroy();
              fail();
            } else parts.push(chunk);
          });
          stream.on("end", () => {
            if (size !== entry.uncompressedSize) return fail();
            result = Buffer.concat(parts);
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--archive-207" || args[2] !== "--exe-206") throw Error();
  const current = await executableFromPinnedArchive(args[1]);
  const previous = await readBounded(args[3], pins.versions["2.0.6"].bytes);
  const reports = {
    "2.0.6": inspectBytes(previous, pins.versions["2.0.6"]),
    "2.0.7": inspectBytes(current, pins.versions["2.0.7"]),
  };
  const comparison = reports["2.0.7"].slices
    .filter((s) => reports["2.0.6"].slices.some((p) => p.name === s.name))
    .map((slice) => {
      const old = reports["2.0.6"].slices.find((s) => s.name === slice.name);
      return {
        name: slice.name,
        ...compareBytes(
          previous.subarray(old.offset, old.offset + old.bytes),
          current.subarray(slice.offset, slice.offset + slice.bytes),
        ),
      };
    });
  const legacy = reports["2.0.7"].slices.find((s) => s.name === "legacy-openapi");
  const document = JSON.parse(current.subarray(legacy.offset, legacy.offset + legacy.bytes));
  const required = [
    ["/v2/system/version", "get"],
    ["/v2/system/health", "get"],
    ["/v2/source-instances", "get"],
    ["/v2/source-instances/{instance_id}/account", "get"],
    ["/v2/instruments/search", "get"],
    ["/v2/source-instances/{instance_id}/authentication", "get"],
    ["/v2/source-instances/{instance_id}/authentication", "post"],
  ];
  console.log(
    JSON.stringify(
      {
        revision: "mp11-static-v1",
        archive207: pins.archive207,
        reports,
        comparison,
        legacyOpenapi: {
          version: document.info.version,
          schemas: Object.keys(document.components.schemas).length,
          requiredOperations: required.map(([path, method]) => ({
            path,
            method,
            state: document.paths[path]?.[method] ? "OBSERVED_STATIC" : "MISSING",
          })),
        },
        runtimeFingerprint207: null,
        strongAccountIdentity: "UNKNOWN",
        nativeSessionEpoch: "UNKNOWN",
        publisherTrust: "UNKNOWN",
        runtime: "NOT_EXECUTED",
        admission: "DENIED",
        productionAllowed: false,
        runtimeQualified: false,
      },
      null,
      2,
    ),
  );
} catch {
  console.log(
    JSON.stringify({ state: "DENIED", reason: "STATIC_INPUT_INVALID", runtimeQualified: false }),
  );
  process.exitCode = 1;
}
