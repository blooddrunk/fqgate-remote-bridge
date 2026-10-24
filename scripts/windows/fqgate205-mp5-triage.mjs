import process from "node:process";
import console from "node:console";
import { TextDecoder } from "node:util";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../dist/config/config.js";
import { createFqgateLayout } from "../../dist/fqgate/install/layout.js";
import { payloadTreeHash } from "../../dist/fqgate/v2/directory-transaction.js";
import { V2_LOOKUP_TREE_HASH } from "../../dist/fqgate/market/v2.js";
import { verifyInstalledQrClient } from "../../dist/fqgate/diagnostics/qr-contract.js";
import { ChildProcessRunner } from "../../dist/fqgate/process/runner.js";
import {
  digest,
  boundedFile,
  fileCondition,
  safeAncestors,
  classifyProcessRecord,
  snapshotProtected,
  compareProtected,
} from "../../dist/fqgate/diagnostics/readiness-evidence.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const outside = (p) => {
  const r = relative(root, resolve(p));
  return r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r);
};
const runner = new ChildProcessRunner();
const commands = [],
  gates = [];
const add = (id, condition, reason) =>
  gates.push({
    id,
    status: condition === "OBSERVED" ? "OBSERVED" : "BLOCKED",
    condition,
    reason,
    repeat: "docs/operations/windows-fqgate205-mp5.md#repeat",
  });
let report = { exitCode: 2, readiness: "BLOCKED" },
  before,
  after,
  protectedFiles;
let getCount = 0;
async function command(executable, argv, maxOutputBytes = 1024 * 1024, timeoutMs = 120000) {
  const utc = new Date().toISOString();
  const r = await runner.run(executable, argv, { timeoutMs, maxOutputBytes });
  commands.push({
    executable,
    argv,
    utc,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    truncated: r.truncated,
    stdoutSha256: digest(r.stdout),
    stderrSha256: digest(r.stderr),
  });
  if (r.timedOut || r.truncated) throw Error();
  return r;
}
try {
  if (
    process.platform !== "win32" ||
    args.length !== 6 ||
    args.filter((_, i) => i % 2 === 0).join() !== "--config,--profiles,--evidence" ||
    ![args[1], args[3], args[5]].every((p) => isAbsolute(p) && outside(p))
  )
    throw Error();
  // Evidence must not be an ancestor of the repo, and neither input may be inside evidence.
  for (const p of [root, args[1], args[3]]) {
    const rel = relative(resolve(args[5]), resolve(p));
    if (!rel || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) throw Error();
  }
  await safeAncestors(dirname(resolve(args[5])));
  const configBytes = await boundedFile(args[1]),
    profileBytes = await boundedFile(args[3], 16384);
  const config = await loadConfig(args[1]);
  const layout = createFqgateLayout(config.installDirectory);
  const installRelative = relative(resolve(config.installDirectory), resolve(args[5]));
  if (
    !installRelative ||
    (installRelative !== ".." &&
      !installRelative.startsWith(`..${sep}`) &&
      !isAbsolute(installRelative))
  )
    throw Error();
  protectedFiles = [args[1], args[3], layout.stateFile, layout.processFile];
  before = await snapshotProtected(root, protectedFiles);
  const git = await command(
    "C:\\Program Files\\Git\\cmd\\git.exe",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, "rev-parse", "HEAD"],
    1024,
    5000,
  );
  if (git.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(git.stdout.trim())) throw Error();
  report.sourceSha = git.stdout.trim();
  const nativeResult = await command(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      resolve(root, "scripts/windows/fqgate205-mp2-native.ps1"),
    ],
    16384,
    15000,
  );
  let native;
  try {
    if (nativeResult.exitCode !== 0) throw Error();
    native = JSON.parse(nativeResult.stdout);
  } catch {
    add("NATIVE_COLLECTION", "UNREADABLE", "NATIVE_INSPECTION_UNAVAILABLE");
  }
  const listeners = Array.isArray(native?.listeners) ? native.listeners : [];
  report.listenerOwners = listeners.map((l) => ({
    port: l.port,
    pid: l.pid,
    exclusiveLoopback: l.address === "127.0.0.1",
  }));
  for (const port of [17281, 17282]) {
    const ls = listeners.filter((l) => l.port === port);
    add(
      `LISTENER_${port}`,
      !native
        ? "UNREADABLE"
        : !ls.length
          ? "ABSENT"
          : ls.length !== 1 || ls[0].address !== "127.0.0.1"
            ? "MISMATCH"
            : "OBSERVED",
      "EXCLUSIVE_IPV4_LOOPBACK_REQUIRED",
    );
  }
  const owner = native?.processes?.find(
    (p) =>
      listeners.filter((l) => l.port === 17281).length === 1 &&
      listeners.some((l) => l.port === 17281 && l.pid === p.pid && l.address === "127.0.0.1"),
  );
  const record = await fileCondition(layout.processFile, 4096);
  let recordCondition = record.condition;
  let recordReason = "RECORD_UNAVAILABLE_OR_UNREADABLE";
  if (record.bytes) {
    try {
      const privateRecord = JSON.parse(
        new TextDecoder("utf8", { fatal: true }).decode(record.bytes),
      );
      recordCondition = classifyProcessRecord(privateRecord, owner, layout.currentExecutable);
      recordReason =
        recordCondition === "STALE"
          ? privateRecord.pid !== owner.pid
            ? "RECORD_PID_STALE"
            : "RECORD_CREATION_STALE_OR_PRECISION_INSUFFICIENT"
          : recordCondition === "MISMATCH"
            ? "RECORD_OR_OWNER_PATH_MISMATCH_OR_UNSAFE"
            : recordCondition === "OBSERVED"
              ? "EXACT_RECORD_PATH_PID_AND_CREATION_MATCH"
              : recordCondition === "UNKNOWN"
                ? "NATIVE_OWNER_UNAVAILABLE_NO_RECORD_COMPARISON"
                : "RECORD_UNAVAILABLE_OR_UNREADABLE";
    } catch {
      recordCondition = "UNREADABLE";
    }
  }
  add("PROCESS_RECORD", recordCondition, recordReason);
  const client = await fileCondition(layout.currentExecutable, 64 * 1024 * 1024);
  if (client.condition !== "OBSERVED")
    add("INSTALLED_CLIENT", client.condition, "PINNED_CLIENT_UNAVAILABLE");
  else {
    try {
      await verifyInstalledQrClient(layout.currentExecutable);
      add("INSTALLED_CLIENT", "OBSERVED", "EXACT_205_EXE_AND_CLIENT_SLICES");
    } catch {
      add("INSTALLED_CLIENT", "MISMATCH", "PINNED_CLIENT_UNVERIFIED");
    }
  }
  for (const [id, path] of [
    ["STATE", layout.stateFile],
    ["INSTALL_LOCK", layout.lockFile],
    ["TRANSACTION", layout.transactionFile],
  ]) {
    const result = await fileCondition(path);
    if (id === "STATE") {
      let condition = result.condition;
      if (result.bytes) {
        try {
          const s = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(result.bytes));
          condition =
            s.schemaVersion === 1 &&
            s.active?.version === "2.0.5" &&
            s.active.size === 53590016 &&
            s.active.sha256 === "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847"
              ? "OBSERVED"
              : "MISMATCH";
        } catch {
          condition = "UNREADABLE";
        }
      }
      add(id, condition, "EXACT_ACTIVE_ARTIFACT_STATE_REQUIRED");
    } else
      add(
        id,
        result.condition === "ABSENT"
          ? "OBSERVED"
          : result.condition === "OBSERVED"
            ? "MISMATCH"
            : result.condition,
        "NO_INSTALL_TRANSACTION_OR_LOCK_REQUIRED",
      );
  }
  try {
    await safeAncestors(layout.currentDirectory);
    // Do not hash mutable browser storage. Its placement already invalidates the immutable tree.
    const names = await readdir(layout.currentDirectory);
    if (names.some((n) => /webview/i.test(n)))
      add("PAYLOAD", "MISMATCH", "WEBVIEW_ENTRY_INSIDE_IMMUTABLE_PAYLOAD_NO_BROWSER_DATA_READ");
    else
      add(
        "PAYLOAD",
        (await payloadTreeHash(layout.currentDirectory)) === V2_LOOKUP_TREE_HASH
          ? "OBSERVED"
          : "MISMATCH",
        "COMPLETE_PINNED_TREE_REQUIRED",
      );
  } catch (e) {
    add("PAYLOAD", e?.code === "ENOENT" ? "ABSENT" : "UNREADABLE", "PAYLOAD_TREE_NOT_VERIFIABLE");
  }
  for (const [name, argv] of [
    ["mp5", [resolve(root, "scripts/windows/fqgate205-mp2-preflight.mjs"), ...args]],
    [
      "qr",
      [
        resolve(root, "scripts/windows/fqgate205-qr-preflight.mjs"),
        "--config",
        args[1],
        "--evidence",
        args[5],
        "--mode",
        "Preflight",
        "--allow-live",
        "False",
      ],
    ],
  ]) {
    const child = await command(process.execPath, argv);
    const value = JSON.parse(child.stdout);
    if (
      ![0, 1, 2].includes(child.exitCode) ||
      value.exitCode !== child.exitCode ||
      !Array.isArray(value.gates)
    )
      throw Error();
    getCount += value.counters?.get ?? 0;
    // Reduced child JSON is already enum-only; enforce bounded gate strings again at receipt boundary.
    report[name] = {
      exitCode: child.exitCode,
      receiptSha256: value.receiptSha256,
      gates: value.gates.map(({ id, status, reason }) => {
        if (
          ![id, status, reason].every(
            (v) => typeof v === "string" && /^[A-Za-z0-9_]{1,160}$/.test(v),
          )
        )
          throw Error();
        return { id, status, reason };
      }),
    };
    if (name === "qr") {
      for (const id of [
        "WEBVIEW_PROFILE",
        "BRIDGE_BUILD",
        "QR_SCOPED_READINESS",
        "RUNTIME_CONTINUITY",
      ]) {
        const gate = value.gates.find((g) => g.id === id);
        const condition =
          gate?.status === "PASS"
            ? "OBSERVED"
            : gate?.reason === "WEBVIEW_PROFILE_INSIDE_IMMUTABLE_PAYLOAD"
              ? "MISMATCH"
              : gate?.reason === "RUNNING_BRIDGE_BUILD_MISMATCH"
                ? "MISMATCH"
                : "UNKNOWN";
        add(id, condition, gate?.reason ?? "PREREQUISITE_UNVERIFIED");
      }
    }
    if (name === "mp5") {
      report.runningBridgeCommit = value.runningCommit;
      report.nativeProfiles = value.profiles;
    }
  }
  if (
    digest(configBytes) !== digest(await boundedFile(args[1])) ||
    digest(profileBytes) !== digest(await boundedFile(args[3], 16384))
  )
    throw Error();
  report.exitCode = 1; // Native identity/epoch remain unqualified even with all host prerequisites observed.
} catch {
  add("TOOLING", "UNREADABLE", "ARGUMENT_CONFIG_COMMAND_OR_RECEIPT_UNVERIFIED");
  report.exitCode = 2;
} finally {
  if (before && protectedFiles) {
    after = await snapshotProtected(root, protectedFiles);
    report.preservedFiles = compareProtected(before, after);
    add(
      "PROTECTED_FILES",
      report.preservedFiles.condition,
      "AUTOMATIC_BEFORE_AFTER_BYTE_COMPARISON",
    );
    if (!report.preservedFiles.unchanged) report.exitCode = 2;
  }
}
for (const id of [
  "LISTENER_17281",
  "LISTENER_17282",
  "INSTALLED_CLIENT",
  "STATE",
  "PAYLOAD",
  "PROCESS_RECORD",
  "WEBVIEW_PROFILE",
  "BRIDGE_BUILD",
  "QR_SCOPED_READINESS",
  "RUNTIME_CONTINUITY",
  "PROTECTED_FILES",
]) {
  if (!gates.some((g) => g.id === id)) add(id, "UNKNOWN", "PREREQUISITE_UNVERIFIED");
}
const toolHashes = {};
for (const file of [
  "scripts/windows/fqgate205-mp5-triage.mjs",
  "scripts/windows/fqgate205-mp2-preflight.mjs",
  "scripts/windows/fqgate205-mp2-native.ps1",
  "scripts/windows/fqgate205-qr-native.ps1",
  "scripts/windows/fqgate205-qr-preflight.mjs",
  "dist/fqgate/diagnostics/source-readiness-mp5.js",
  "dist/fqgate/diagnostics/readiness-evidence.js",
  "dist/fqgate/diagnostics/qr-preflight.js",
  "dist/fqgate/diagnostics/qr-contract.js",
  "dist/bridge/qr/v2-identity.js",
  "dist/bridge/qr/v2.js",
  "dist/fqgate/market/v2.js",
  "dist/fqgate/market/v2-identity.js",
]) {
  try {
    toolHashes[file] = digest(await readFile(resolve(root, file)));
  } catch {
    toolHashes[file] = "UNREADABLE";
    report.exitCode = 2;
  }
}
report = {
  ...report,
  schemaVersion: 1,
  mode: "MP5_NON_MUTATING_TRIAGE",
  utc: new Date().toISOString(),
  command: commands.length ? { executable: process.execPath, argv: process.argv.slice(1) } : null,
  qualification: "LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED",
  abExperimentReady: false,
  commands,
  totals: {
    observed: gates.filter((g) => g.status === "OBSERVED").length,
    blocked: gates.filter((g) => g.status === "BLOCKED").length,
  },
  gates,
  toolHashes,
  counters: {
    get: getCount,
    post: 0,
    accountWrites: 0,
    qrBegin: 0,
    qrPoll: 0,
    processMutations: 0,
  },
  resumeProcedure: "docs/operations/windows-fqgate205-mp5.md",
};
try {
  if (!commands.length || args.length !== 6 || !outside(args[5])) throw Error();
  await mkdir(resolve(args[5]), { recursive: true });
  await safeAncestors(resolve(args[5]));
  const bytes = JSON.stringify(report, null, 2) + "\n";
  if (bytes.length > 65536) throw Error();
  const file = resolve(args[5], `mp5-triage-${Date.now()}.json`);
  await writeFile(file, bytes, { flag: "wx" });
  await writeFile(`${file}.sha256`, digest(bytes) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...report, receiptFile: file, receiptSha256: digest(bytes) }));
} catch {
  console.log(JSON.stringify({ exitCode: 2, receiptSaved: false, readiness: "BLOCKED" }));
  report.exitCode = 2;
}
process.exitCode = report.exitCode;
