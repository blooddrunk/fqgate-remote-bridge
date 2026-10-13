import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { FqgateLayout } from "../install/layout.js";
import { pathExists } from "../install/layout.js";
import { readFqgateState } from "../install/state.js";
import type { ProcessRunner } from "../process/types.js";
import { fingerprintJson } from "../openapi/catalog.js";
import { payloadTreeHash } from "../v2/directory-transaction.js";
import { V2_LOOKUP_TREE_HASH, V2_LOOKUP_VERSION } from "./v2.js";

/** Read-only identity gate. Never adopts, starts/stops, clears records or changes state. */
export async function verifyV2LookupIdentity(
  layout: FqgateLayout,
  runner: ProcessRunner,
): Promise<string> {
  try {
    if (
      process.platform !== "win32" ||
      (await pathExists(layout.lockFile)) ||
      (await pathExists(layout.transactionFile))
    )
      throw new Error();
    const state = await readFqgateState(layout);
    if (
      state.active?.version !== V2_LOOKUP_VERSION ||
      state.active.size !== 53_590_016 ||
      state.active.sha256 !== "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847"
    )
      throw new Error();
    const stat = await lstat(layout.processFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error();
    const record = JSON.parse(await readFile(layout.processFile, "utf8")) as {
      pid?: unknown;
      executablePath?: unknown;
    };
    if (
      !Number.isSafeInteger(record.pid) ||
      Number(record.pid) <= 0 ||
      typeof record.executablePath !== "string" ||
      normalize(record.executablePath) !== normalize(layout.currentExecutable)
    )
      throw new Error();
    if ((await payloadTreeHash(layout.currentDirectory)) !== V2_LOOKUP_TREE_HASH) throw new Error();
    const result = await runner.run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $l=@(Get-NetTCPConnection -State Listen -LocalPort 17281); if ($l.Count -ne 1 -or $l[0].LocalAddress -ne '127.0.0.1') {exit 4}; $p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$l[0].OwningProcess); if ($null -eq $p -or -not $p.ExecutablePath -or -not $p.CreationDate) {exit 5}; [pscustomobject]@{pid=[int]$p.ProcessId; path=$p.ExecutablePath; created=$p.CreationDate.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress",
      ],
      { timeoutMs: 5000, maxOutputBytes: 4096 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.truncated) throw new Error();
    const native = JSON.parse(result.stdout) as {
      pid?: unknown;
      path?: unknown;
      created?: unknown;
    };
    if (
      native.pid !== record.pid ||
      typeof native.path !== "string" ||
      normalize(native.path) !== normalize(layout.currentExecutable) ||
      typeof native.created !== "string" ||
      !Number.isFinite(Date.parse(native.created))
    )
      throw new Error();
    if ((await pathExists(layout.lockFile)) || (await pathExists(layout.transactionFile)))
      throw new Error();
    return fingerprintJson({
      pid: native.pid,
      path: normalize(native.path),
      created: native.created,
      tree: V2_LOOKUP_TREE_HASH,
    });
  } catch {
    throw new BridgeError(
      ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
      "FQGate v2 payload/process/listener identity could not be verified",
    );
  }
}
function normalize(path: string): string {
  return resolve(path).replaceAll("/", "\\").toLowerCase();
}
