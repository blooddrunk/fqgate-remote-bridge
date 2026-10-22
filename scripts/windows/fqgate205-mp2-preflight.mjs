import process from "node:process";
import console from "node:console";
import { readFile, lstat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../dist/config/config.js";
import { createFqgateLayout } from "../../dist/fqgate/install/layout.js";
import { verifyV2QrIdentity } from "../../dist/bridge/qr/v2-identity.js";
import { verifyInstalledQrClient } from "../../dist/fqgate/diagnostics/qr-contract.js";
import { ChildProcessRunner } from "../../dist/fqgate/process/runner.js";
import { FetchHttpTransport } from "../../dist/fqgate/release/http.js";
import {
  inspectProfilePreflight,
  parseProfilePreflightConfig,
} from "../../dist/fqgate/diagnostics/profile-preflight.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outside = (path) => {
  const r = relative(root, resolve(path));
  return r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r);
};
const hash = (v) => createHash("sha256").update(v).digest("hex");
const runner = new ChildProcessRunner();
const args = process.argv.slice(2);
let report;
try {
  if (
    process.platform !== "win32" ||
    args.length !== 6 ||
    args.filter((_, i) => i % 2 === 0).join() !== "--config,--profiles,--evidence" ||
    !outside(args[3]) ||
    !outside(args[5])
  )
    throw Error();
  const config = await loadConfig(args[1]);
  const stat = await lstat(args[3]);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw Error();
  const profileBytes = await readFile(args[3]);
  const profiles = parseProfilePreflightConfig(JSON.parse(profileBytes.toString("utf8")));
  const layout = createFqgateLayout(config.installDirectory);
  const checkout = await runner.run(
    "C:\\Program Files\\Git\\cmd\\git.exe",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, "rev-parse", "HEAD"],
    { timeoutMs: 5000, maxOutputBytes: 1024 },
  );
  if (checkout.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(checkout.stdout.trim())) throw Error();
  let previousIdentity;
  const native = async (pids) => {
    const result = await runner.run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        resolve(root, "scripts/windows/fqgate205-mp2-native.ps1"),
        ...(pids.length ? ["-WorkerPids", pids.join(",")] : []),
      ],
      { timeoutMs: 15000, maxOutputBytes: 16384 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.truncated) throw Error();
    const facts = JSON.parse(result.stdout);
    if (!Array.isArray(facts.listeners) || !Array.isArray(facts.processes)) throw Error();
    let payloadVerified = false,
      recordVerified = false;
    try {
      await verifyInstalledQrClient(layout.currentExecutable);
      payloadVerified = true;
      const identity = await verifyV2QrIdentity(layout, runner);
      if (previousIdentity !== undefined && identity !== previousIdentity) throw Error();
      previousIdentity = identity;
      recordVerified = true;
    } catch {
      /* Reduced gates only. No exception/path/account payload is persisted. */
    }
    if (!profileBytes.equals(await readFile(args[3]))) throw Error();
    return { ...facts, payloadVerified, recordVerified };
  };
  report = await inspectProfilePreflight({
    config: profiles,
    checkoutCommit: checkout.stdout.trim(),
    http: new FetchHttpTransport(),
    native,
  });
} catch {
  report = {
    schemaVersion: 1,
    qualification: "LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED",
    exitCode: 2,
    gates: [
      {
        id: "TOOLING_CONFIG",
        status: "BLOCKED",
        reason: "WINDOWS_BUILD_ARGUMENTS_OR_PRIVATE_CONFIG_INVALID",
      },
    ],
    counters: { post: 0, accountWrites: 0, qrBegin: 0, qrPoll: 0 },
  };
}
const toolHashes = {};
for (const name of [
  "scripts/windows/fqgate205-mp2-preflight.mjs",
  "scripts/windows/fqgate205-mp2-native.ps1",
  "dist/fqgate/diagnostics/profile-preflight.js",
]) {
  try {
    toolHashes[name] = hash(await readFile(resolve(root, name)));
  } catch {
    toolHashes[name] = "UNREADABLE";
  }
}
const receipt = {
  ...report,
  toolHashes,
  utc: new Date().toISOString(),
  mode: "Preflight",
  realLoginAuthorized: false,
};
try {
  if (args.length !== 6 || !outside(args[5])) throw Error();
  await mkdir(resolve(args[5]), { recursive: true });
  const file = resolve(args[5], `mp2-preflight-${Date.now()}.json`);
  const bytes = JSON.stringify(receipt, null, 2) + "\n";
  await writeFile(file, bytes, { flag: "wx" });
  await writeFile(`${file}.sha256`, hash(bytes) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...receipt, receiptFile: file, receiptSha256: hash(bytes) }));
  process.exitCode = report.exitCode;
} catch {
  console.log(JSON.stringify({ ...receipt, receiptSaved: false }));
  process.exitCode = 2;
}
