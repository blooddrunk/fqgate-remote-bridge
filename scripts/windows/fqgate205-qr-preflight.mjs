import process from "node:process";
import console from "node:console";
import { TextDecoder } from "node:util";
import { createHash } from "node:crypto";
import { readFile, lstat, mkdir, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../dist/config/config.js";
import { createFqgateLayout, pathExists } from "../../dist/fqgate/install/layout.js";
import { readFqgateState } from "../../dist/fqgate/install/state.js";
import { payloadTreeHash } from "../../dist/fqgate/v2/directory-transaction.js";
import { V2_LOOKUP_TREE_HASH } from "../../dist/fqgate/market/v2.js";
import { ChildProcessRunner } from "../../dist/fqgate/process/runner.js";
import { FetchHttpTransport } from "../../dist/fqgate/release/http.js";
import { fingerprintJson } from "../../dist/fqgate/openapi/catalog.js";
import { verifyInstalledQrClient } from "../../dist/fqgate/diagnostics/qr-contract.js";
import { FqgateV2QrAdapter } from "../../dist/bridge/qr/v2.js";
import { verifyV2QrIdentity } from "../../dist/bridge/qr/v2-identity.js";
import { inspectQrPrerequisites } from "../../dist/fqgate/diagnostics/qr-preflight.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gates = [];
const args = process.argv.slice(2);
const option = (key) => args[args.indexOf(key) + 1];
const retry = String.raw`Set-Location D:\code\research\fqgate-remote-bridge; powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json`;
function add(
  id,
  status,
  reason,
  evidence = {},
  recovery = "Resolve the named prerequisite with separate approval for any repair, then repeat Preflight.",
) {
  gates.push({
    id,
    status,
    reason,
    evidence,
    impact: "v2 QR remains unavailable.",
    recovery,
    retry,
  });
}
const runner = new ChildProcessRunner();
const transport = new FetchHttpTransport();
let getCount = 0;
const http = {
  request(url, options) {
    getCount++;
    return transport.request(url, options);
  },
};
async function json(url, maxBytes = 65536) {
  const r = await http.request(url, {
    method: "GET",
    redirect: "manual",
    timeoutMs: 5000,
    maxBytes,
  });
  if (r.status !== 200 || r.body.byteLength > maxBytes) throw Error();
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(r.body));
}
let evidenceDirectory,
  gitSha = "unknown",
  exitCode = 1;
try {
  if (
    process.platform !== "win32" ||
    args.length !== 8 ||
    args.filter((_, i) => i % 2 === 0).join() !== "--config,--evidence,--mode,--allow-live" ||
    !["Preflight", "Live"].includes(option("--mode")) ||
    !["True", "False"].includes(option("--allow-live"))
  )
    throw Error();
  evidenceDirectory = resolve(option("--evidence"));
  const within = relative(root, evidenceDirectory);
  if (!within || (within !== ".." && !within.startsWith(`..${sep}`) && !isAbsolute(within)))
    throw Error();
  const config = await loadConfig(option("--config"));
  add("CONFIG", "PASS", "VALIDATED_WITHOUT_SAVING_CONFIG");
  const git = await runner.run(
    "git.exe",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, "rev-parse", "HEAD"],
    { timeoutMs: 5000, maxOutputBytes: 1024 },
  );
  if (git.exitCode === 0 && /^[a-f0-9]{40}$/.test(git.stdout.trim())) gitSha = git.stdout.trim();
  add(
    "CHECKOUT_SHA",
    gitSha === "unknown" ? "BLOCKED" : "PASS",
    gitSha === "unknown" ? "GIT_SHA_UNAVAILABLE" : "EXACT_CHECKOUT_SHA",
    { gitSha },
  );
  const layout = createFqgateLayout(config.installDirectory);
  const snapshot = async () => {
    // A mutable browser root invalidates the immutable payload; never read its contents.
    if ((await readdir(layout.currentDirectory)).some((name) => /webview/i.test(name)))
      throw Error();
    immutableRootSafe = true;
    const recordStat = await lstat(layout.processFile);
    if (!recordStat.isFile() || recordStat.isSymbolicLink() || recordStat.size > 4096)
      throw Error();
    const record = await readFile(layout.processFile);
    const stateStat = await lstat(layout.stateFile);
    if (!stateStat.isFile() || stateStat.isSymbolicLink() || stateStat.size > 65536) throw Error();
    const state = await readFile(layout.stateFile);
    return {
      processFileSha256: hash(record),
      stateFileSha256: hash(state),
      payloadTreeSha256: await payloadTreeHash(layout.currentDirectory),
    };
  };
  let before;
  let immutableRootSafe = false;
  try {
    before = await snapshot();
    const state = await readFqgateState(layout);
    if (
      before.payloadTreeSha256 !== V2_LOOKUP_TREE_HASH ||
      state.active?.version !== "2.0.5" ||
      state.active.size !== 53590016 ||
      state.active.sha256 !== "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847" ||
      (await pathExists(layout.lockFile)) ||
      (await pathExists(layout.transactionFile))
    )
      throw Error();
    add("PAYLOAD", "PASS", "PINNED_205_PAYLOAD_STATE", before);
  } catch {
    add("PAYLOAD", "BLOCKED", "INSTALLATION_DRIFT_OR_TRANSACTION_OR_UNREADABLE");
  }
  const native = async () => {
    const r = await runner.run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        resolve(root, "scripts/windows/fqgate205-qr-native.ps1"),
        "-CurrentDirectory",
        layout.currentDirectory,
        "-ProcessFile",
        layout.processFile,
      ],
      { timeoutMs: 15000, maxOutputBytes: 8192 },
    );
    if (r.exitCode !== 0 || r.timedOut || r.truncated) throw Error();
    const value = JSON.parse(r.stdout);
    if (!value.checks || typeof value.checks !== "object" || Array.isArray(value.checks))
      throw Error();
    return value;
  };
  let firstNative;
  try {
    firstNative = await native();
    const ids = ["LISTENER_17281", "LISTENER_17282", "PROCESS_RECORD", "WEBVIEW_PROFILE"];
    const reasons = new Set([
      "PASS",
      "LISTENER_ABSENT",
      "LISTENER_NOT_EXCLUSIVE_IPV4_LOOPBACK",
      "PROCESS_RECORD_NATIVE_IDENTITY_MISMATCH_OR_UNREADABLE",
      "WEBVIEW_PROFILE_INSIDE_IMMUTABLE_PAYLOAD",
      "WEBVIEW_PROFILE_UNVERIFIED",
    ]);
    for (const id of ids) {
      const reason = firstNative.checks[id];
      add(
        id,
        reason === "PASS" ? "PASS" : "BLOCKED",
        reasons.has(reason) ? reason : "NATIVE_FACT_UNVERIFIED",
        id === "PROCESS_RECORD" && reason === "PASS"
          ? {
              pid: firstNative.binding.pid,
              createdUtc: firstNative.binding.created,
              powershellVersion: firstNative.powershellVersion,
            }
          : {},
      );
    }
  } catch {
    add(
      "NATIVE_INSPECTION",
      "BLOCKED",
      "NATIVE_INSPECTION_FAILED",
      {},
      "Retry in native PowerShell. If process path access is denied, run the same read-only Preflight in an elevated terminal; it only writes the external receipt, never process/service/network configuration.",
    );
  }
  try {
    if (firstNative?.checks.LISTENER_17282 !== "PASS") throw Error();
    const v = await json("http://127.0.0.1:17282/api/v1/version");
    if (
      v?.name !== "fqgate-remote-bridge" ||
      typeof v.commit !== "string" ||
      !/^[a-f0-9]{40}$/.test(v.commit)
    )
      throw Error();
    add(
      "BRIDGE_BUILD",
      v.commit === gitSha ? "PASS" : "BLOCKED",
      v.commit === gitSha ? "EXACT_CHECKOUT_BUILD" : "RUNNING_BRIDGE_BUILD_MISMATCH",
      { runningCommit: v.commit, matchesCheckout: v.commit === gitSha },
      "Obtain separate approval to replace only Bridge with the reviewed checkout build, then repeat Preflight. Do not restart FQGate or begin QR to resolve this gate.",
    );
  } catch {
    add("BRIDGE_BUILD", "BLOCKED", "BRIDGE_VERSION_UNAVAILABLE_OR_UNBOUND");
  }
  let staticClientVerified = false;
  try {
    const proof = await verifyInstalledQrClient(layout.currentExecutable);
    staticClientVerified = true;
    add("QR_STATIC_CLIENT", "PASS", "EXACT_INSTALLED_STATIC_CLIENT", proof);
  } catch {
    add("QR_STATIC_CLIENT", "BLOCKED", "STATIC_CLIENT_CONTRACT_UNVERIFIED");
  }
  for (const gate of await inspectQrPrerequisites({
    http,
    staticClientVerified,
    ...(config.qrV2 === undefined ? {} : { instanceNumber: config.qrV2.instanceNumber }),
  }))
    gates.push({ ...gate, retry });
  try {
    if (!immutableRootSafe) throw Object.assign(Error(), { code: "PROCESS_IDENTITY_MISMATCH" });
    await new FqgateV2QrAdapter({
      http,
      identity: () => verifyV2QrIdentity(layout, runner),
      ...(config.qrV2 === undefined ? {} : { instanceNumber: config.qrV2.instanceNumber }),
    }).inspect();
    add("QR_SCOPED_READINESS", "PASS", "EXACT_ADAPTER_READONLY_READY");
  } catch (error) {
    add(
      "QR_SCOPED_READINESS",
      "BLOCKED",
      ["FQGATE_INCOMPATIBLE", "PROCESS_IDENTITY_MISMATCH", "OPENAPI_CONTRACT_MISSING"].includes(
        error?.code,
      )
        ? error.code
        : "QR_READINESS_UNVERIFIED",
    );
  }

  for (const kind of ["admin", "machine"]) {
    const access = config.remoteAccess[`${kind}Access`];
    if (!access) {
      add(`ACCESS_CERT_${kind}`, "NOT_EXECUTED", "ACCESS_NOT_CONFIGURED");
      continue;
    }
    try {
      // loadConfig restricts teamDomain; no URL input, credentials, cookies or JWTs.
      const certs = await json(`https://${access.teamDomain}/cdn-cgi/access/certs`);
      if (!Array.isArray(certs.keys) || certs.keys.length === 0 || certs.keys.length > 16)
        throw Error();
      add(`ACCESS_CERT_${kind}`, "PASS", "CERT_ENDPOINT_REACHABLE", {
        keyCount: certs.keys.length,
        jwtValidationProven: false,
      });
    } catch {
      add(`ACCESS_CERT_${kind}`, "BLOCKED", "ACCESS_CERT_ENDPOINT_UNREACHABLE_OR_INVALID");
    }
  }
  for (const kind of ["remote", "admin", "machine"]) {
    const host = config.remoteAccess[`${kind}Hostname`];
    if (!host) {
      add(`TUNNEL_${kind}`, "NOT_EXECUTED", "HOST_NOT_CONFIGURED");
      continue;
    }
    try {
      const r = await http.request(`https://${host}/`, {
        method: "GET",
        redirect: "manual",
        timeoutMs: 5000,
        maxBytes: 65536,
      });
      const challenge = [302, 303, 307, 308, 401, 403].includes(r.status);
      add(
        `TUNNEL_${kind}`,
        challenge ? "PASS" : "BLOCKED",
        challenge
          ? "UNAUTHENTICATED_EDGE_RESPONSE"
          : r.status === 502
            ? "REMOTE_HTTP_502"
            : "REMOTE_UNEXPECTED_RESPONSE",
        { httpStatus: r.status, authenticatedOriginProven: false },
      );
    } catch {
      add(`TUNNEL_${kind}`, "BLOCKED", "REMOTE_TIMEOUT_OR_TRANSPORT_FAILURE");
    }
  }
  try {
    const after = await snapshot(),
      lastNative = await native();
    if (
      !before ||
      !firstNative?.binding ||
      !lastNative.binding ||
      JSON.stringify(before) !== JSON.stringify(after) ||
      fingerprintJson(firstNative) !== fingerprintJson(lastNative)
    )
      throw Error();
    add("RUNTIME_CONTINUITY", "PASS", "SAMPLED_FILES_NATIVE_IDENTITY_UNCHANGED", after);
  } catch {
    add("RUNTIME_CONTINUITY", "BLOCKED", "FILES_PROCESS_LISTENERS_PROFILE_CHANGED_OR_UNVERIFIED");
  }
  if (option("--mode") === "Live")
    add(
      "LIVE_REQUEST",
      "NOT_EXECUTED",
      option("--allow-live") === "True" ? "LIVE_HARNESS_REQUIRED" : "EXPLICIT_LIVE_APPROVAL_ABSENT",
      {},
      "Use the dedicated Live harness only after explicit approval and passing readiness/build gates. This diagnostic sends no POST.",
    );
} catch {
  add("PREFLIGHT", "BLOCKED", "CONFIG_TOOLING_OR_ARGUMENTS_INVALID");
}
const sourceHashes = {};
for (const file of [
  "scripts/windows/fqgate205-qr-acceptance.ps1",
  "scripts/windows/fqgate205-qr-live.mjs",
  "scripts/windows/fqgate205-qr-window.mjs",
  "tests/e2e/qr-window.spec.ts",
  "scripts/windows/test-fqgate205-qr-identity.mjs",
  "scripts/windows/fqgate205-qr-native.ps1",
  "scripts/windows/fqgate205-qr-preflight.mjs",
  "src/fqgate/diagnostics/qr-preflight.ts",
  "scripts/windows/test-fqgate205-qr-preflight.ps1",
  "tests/fqgate205-qr-preflight.test.ts",
  "src/bridge/qr/v2.ts",
  "src/bridge/qr/v2-identity.ts",
  "src/fqgate/diagnostics/qr-contract.ts",
  "tests/fqgate205-qr-adapter.test.ts",
  "tests/fqgate205-qr-identity.test.ts",
]) {
  try {
    sourceHashes[file] = hash(await readFile(resolve(root, file)));
  } catch {
    add("SOURCE_HASH", "BLOCKED", "DIAGNOSTIC_SOURCE_UNREADABLE");
  }
}
exitCode = gates.some((g) => g.status === "BLOCKED") || option("--mode") === "Live" ? 1 : 0;
let receiptSaved = false;
const report = {
  counters: { get: getCount, post: 0, accountWrites: 0, qrBegin: 0, qrPoll: 0 },
  sourceHashes,
  schemaVersion: 1,
  utc: new Date().toISOString(),
  gitSha,
  environment: { platform: process.platform, node: process.version, architecture: process.arch },
  command: "fqgate205-qr-acceptance.ps1",
  mode: option("--mode"),
  exitCode,
  totals: {
    total: gates.length,
    passed: gates.filter((g) => g.status === "PASS").length,
    blocked: gates.filter((g) => g.status === "BLOCKED").length,
    notExecuted: gates.filter((g) => g.status === "NOT_EXECUTED").length,
  },
  automation: true,
  humanApproval: "NOT_COLLECTED",
  liveQrStarted: false,
  signatureVerified: false,
  gates,
};
try {
  if (!evidenceDirectory) throw Error();
  await mkdir(evidenceDirectory, { recursive: true });
  const name = `preflight-${Date.now()}.json`,
    bytes = JSON.stringify(report, null, 2) + "\n";
  await writeFile(resolve(evidenceDirectory, name), bytes, { flag: "wx" });
  await writeFile(resolve(evidenceDirectory, `${name}.sha256`), hash(bytes) + "\n", { flag: "wx" });
  receiptSaved = true;
  console.log(JSON.stringify({ ...report, receiptFile: name, receiptSha256: hash(bytes) }));
} catch {
  console.log(JSON.stringify({ ...report, receiptSaved: false }));
}
process.exitCode = receiptSaved ? exitCode : 2;
