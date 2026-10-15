import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { fingerprintJson } from "../../fqgate/openapi/catalog.js";
import type { FqgateLayout } from "../../fqgate/install/layout.js";
import type { ProcessRunner } from "../../fqgate/process/types.js";
import { verifyV2LookupIdentity } from "../../fqgate/market/v2-identity.js";
import { V2_LOOKUP_TREE_HASH } from "../../fqgate/market/v2.js";
const normalize = (p: string) => resolve(p).replaceAll("/", "\\").toLowerCase();
const quote = (p: string) => `'${p.replaceAll("'", "''")}'`;
/** Additional QR identity gate: recorded creation plus native WebView profile separation. Read-only. */
export async function verifyV2QrIdentity(
  layout: FqgateLayout,
  runner: ProcessRunner,
): Promise<string> {
  try {
    const baseline = await verifyV2LookupIdentity(layout, runner);
    const stat = await lstat(layout.processFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error();
    const before = await readFile(layout.processFile),
      record = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(before)) as {
        pid?: unknown;
        startedAt?: unknown;
      };
    if (
      !Number.isSafeInteger(record.pid) ||
      Number(record.pid) <= 0 ||
      typeof record.startedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,7}Z$/.test(record.startedAt)
    )
      throw Error();
    const result = await runner.run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        qrNativeInspectionCommand(layout.currentDirectory, Number(record.pid)),
      ],
      { timeoutMs: 5000, maxOutputBytes: 4096 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.truncated) throw Error();
    const native = JSON.parse(result.stdout) as {
      pid?: unknown;
      path?: unknown;
      created?: unknown;
      profileOutside?: unknown;
    };
    if (
      native.pid !== record.pid ||
      typeof native.path !== "string" ||
      normalize(native.path) !== normalize(layout.currentExecutable) ||
      typeof native.created !== "string" ||
      native.profileOutside !== true ||
      !Number.isFinite(Date.parse(native.created)) ||
      Date.parse(native.created) !== Date.parse(record.startedAt)
    )
      throw Error();
    const identity = fingerprintJson({
      pid: native.pid,
      path: normalize(native.path),
      created: native.created,
      tree: V2_LOOKUP_TREE_HASH,
    });
    if (identity !== baseline || !before.equals(await readFile(layout.processFile))) throw Error();
    return identity;
  } catch {
    throw new BridgeError(
      ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
      "Exact QR process/creation/profile identity could not be verified",
    );
  }
}

/** Exported for native behavior fixtures, never exposed as an HTTP operation. */
export function qrNativeInspectionCommand(currentDirectory: string, pid: number): string {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647)
    throw new BridgeError(ERROR_CODES.PROCESS_IDENTITY_MISMATCH, "Invalid native PID");
  return `
$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}';
if (-not $p.ExecutablePath -or -not $p.CreationDate) {exit 4};
$all=@(Get-CimInstance Win32_Process); $parents=@([int]$p.ProcessId); $views=@();
for($depth=0;$depth -lt 8;$depth++) {
 $children=@($all|Where-Object { [int]$_.ParentProcessId -in $parents -and [int]$_.ProcessId -notin $parents });
 if($children.Count -eq 0){break}; if($children.Count -gt 128){exit 5};
 $views+=@($children|Where-Object {$_.Name -ieq 'msedgewebview2.exe'}); $parents=@($children|ForEach-Object {[int]$_.ProcessId});
};
$prefix=${quote(currentDirectory)}.TrimEnd('\\')+'\\'; $found=0;
foreach($view in $views) {
 if(-not $view.CommandLine){exit 5};
 if($view.CommandLine -match '--user-data-dir=(?:"([^"]+)"|([^\\s"]+))') {
  $directory=if($Matches[1]){$Matches[1]}else{$Matches[2]};
  if(-not [IO.Path]::IsPathRooted($directory)){exit 5}; $directory=[IO.Path]::GetFullPath($directory);
  if($directory.Equals($prefix.TrimEnd('\\'),[StringComparison]::OrdinalIgnoreCase) -or $directory.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){exit 5}; $found++;
 }
}; if($found -eq 0){exit 5};
[pscustomobject]@{pid=[int]$p.ProcessId; path=$p.ExecutablePath; created=$p.CreationDate.ToUniversalTime().ToString('o'); profileOutside=$true}|ConvertTo-Json -Compress
`;
}
