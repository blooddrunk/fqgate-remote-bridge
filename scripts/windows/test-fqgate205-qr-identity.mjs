import process from "node:process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { qrNativeInspectionCommand } from "../../dist/bridge/qr/v2-identity.js";
import { ChildProcessRunner } from "../../dist/fqgate/process/runner.js";
if (process.platform !== "win32") throw Error("NATIVE_WINDOWS_REQUIRED");
const runner = new ChildProcessRunner();
let count = 0;
for (const [profile, expected] of [
  ["C:\\mutable-profile", 0],
  ["C:\\payload\\current\\FQGate.exe.WebView2", 5],
  ["C:\\payload\\current", 5],
  ["relative-profile", 5],
  [null, 5],
]) {
  const line = profile === null ? "$null" : `'--user-data-dir="${profile}" private-marker'`;
  const mock = `function Get-CimInstance { param($ClassName,$Filter)
    if($Filter){return [pscustomobject]@{ProcessId=123;ExecutablePath='C:\\payload\\current\\fqgate.exe';CreationDate=[DateTime]::UtcNow}}
    return @([pscustomobject]@{ProcessId=456;ParentProcessId=123;Name='msedgewebview2.exe';CommandLine=${line}})
  };`;
  const r = await runner.run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      mock + qrNativeInspectionCommand("C:\\payload\\current", 123),
    ],
    { timeoutMs: 10000, maxOutputBytes: 4096 },
  );
  if (r.exitCode !== expected || r.timedOut || r.truncated || r.stdout.includes("private-marker"))
    throw Error("NATIVE_QR_IDENTITY_FIXTURE_FAILED");
  if (expected === 0 && JSON.parse(r.stdout).profileOutside !== true)
    throw Error("NATIVE_PROFILE_NOT_VERIFIED");
  count++;
}
process.stdout.write(`PASS inline native QR identity behavior fixtures ${count}/${count}\n`);

const temporary = await mkdtemp(resolve(tmpdir(), "qr-live-approval-fixture-"));
try {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "fqgate205-qr-live.mjs");
  const result = await runner.run(
    process.execPath,
    [
      script,
      "--config",
      "C:\\missing-fixture-config.json",
      "--evidence",
      temporary,
      "--allow-live",
      "False",
    ],
    { timeoutMs: 10000, maxOutputBytes: 8192 },
  );
  const value = JSON.parse(result.stdout);
  if (
    result.exitCode !== 1 ||
    result.timedOut ||
    result.truncated ||
    value.liveQrStarted !== false ||
    value.humanApproval !== "NOT_COLLECTED" ||
    value.environment.browserVersion !== "NOT_EXECUTED" ||
    value.gates[0]?.reason !== "EXPLICIT_APPROVAL_ABSENT"
  )
    throw Error("LIVE_APPROVAL_GUARD_FAILED");
  process.stdout.write("PASS native Live no-approval guard 1/1\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
