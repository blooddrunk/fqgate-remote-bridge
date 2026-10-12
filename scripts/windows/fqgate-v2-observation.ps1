[CmdletBinding()]
param(
  [string]$ConfigPath = "D:\code\research\fqgate-acceptance-config.json",
  [string]$EvidencePath = "D:\code\research\fqgate-v2-observation-evidence.json",
  [switch]$AuditArchive
)
$ErrorActionPreference = "Stop"
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if ($repo.TrimEnd('\') -ine "D:\code\research\fqgate-remote-bridge") { throw "Requires permanent Windows checkout" }
$evidence = [IO.Path]::GetFullPath($EvidencePath)
if ($evidence.StartsWith($repo.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Evidence must stay outside Git" }
$node = "C:\Program Files\nodejs\node.exe"
$git = "C:\Program Files\Git\cmd\git.exe"
$cli = Join-Path $repo "dist\cli\main.js"
if (!(Test-Path $cli) -or !(Test-Path $node) -or !(Test-Path $git)) { throw "Built CLI, Node and Git are required" }
# Use native ProcessStartInfo so output and exit code are captured together.
function Invoke-ReadOnly([string]$File, [string]$Arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $File; $info.Arguments = $Arguments; $info.WorkingDirectory = $repo
  $info.UseShellExecute = $false; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true; $info.CreateNoWindow = $true
  $proc = New-Object Diagnostics.Process; $proc.StartInfo = $info
  [void]$proc.Start()
  $stdout = $proc.StandardOutput.ReadToEndAsync(); $stderr = $proc.StandardError.ReadToEndAsync()
  $proc.WaitForExit()
  $result = @{ exitCode = $proc.ExitCode; stdout = $stdout.Result; stderr = $stderr.Result }
  $proc.Dispose(); return $result
}
$gitArgs = '-c safe.directory=D:/code/research/fqgate-remote-bridge'
$head = Invoke-ReadOnly $git "$gitArgs rev-parse HEAD"
$status = Invoke-ReadOnly $git "$gitArgs status --porcelain"
if ($head.exitCode -ne 0 -or $status.exitCode -ne 0) { throw "Unable to inspect permanent checkout" }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$homePath = [IO.Path]::GetFullPath($config.installDirectory)
$fqgateDir = Join-Path $homePath 'fqgate'
$files = @{}
foreach ($relative in @('current\fqgate.exe','previous\fqgate.exe','state.json','process.json','install.lock','transaction.json')) {
  $path = Join-Path $fqgateDir $relative
  $exists = Test-Path -LiteralPath $path -PathType Leaf
  $files[$relative] = @{ present = $exists }
  if ($exists) {
    $files[$relative].bytes = (Get-Item -LiteralPath $path).Length
    $files[$relative].sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($relative.EndsWith('.exe')) { $files[$relative].fileVersion = (Get-Item -LiteralPath $path).VersionInfo.FileVersion }
  }
}
$listeners = @()
foreach ($port in @(17281,17282)) {
  $items = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  foreach ($item in $items) {
    $identity = "UNKNOWN"
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process.ExecutablePath) {
      if ($port -eq 17281 -and [IO.Path]::GetFullPath($process.ExecutablePath) -ieq (Join-Path $fqgateDir 'current\fqgate.exe')) { $identity = "MANAGED_PATH_MATCH" }
      else { $identity = "OTHER_PATH" }
    }
    $listeners += @{ port = $port; address = $item.LocalAddress; pid = $item.OwningProcess; identity = $identity }
  }
}
$command = if ($AuditArchive) { 'audit-v2' } else { 'inspect-v2' }
$observation = Invoke-ReadOnly $node ('"' + $cli + '" fqgate ' + $command + ' --json')
$report = $null
if ($observation.stdout.Trim()) { $report = $observation.stdout | ConvertFrom-Json }
$checks = @(
  @{ id='permanent-checkout-clean'; status=$(if (!$status.stdout.Trim()) { 'PASS' } else { 'BLOCKED' }) },
  @{ id='fqgate-loopback'; status=$(if (@($listeners | Where-Object { $_.port -eq 17281 }).Count -eq 1 -and @($listeners | Where-Object { $_.port -eq 17281 -and $_.address -eq '127.0.0.1' }).Count -eq 1) { 'PASS' } else { 'BLOCKED' }) },
  @{ id='bridge-loopback'; status=$(if (@($listeners | Where-Object { $_.port -eq 17282 }).Count -eq 1 -and @($listeners | Where-Object { $_.port -eq 17282 -and $_.address -eq '127.0.0.1' }).Count -eq 1) { 'PASS' } else { 'BLOCKED' }) },
  @{ id='fqgate-managed-process'; status=$(if (@($listeners | Where-Object { $_.port -eq 17281 -and $_.identity -eq 'MANAGED_PATH_MATCH' }).Count -eq 1) { 'PASS' } else { 'BLOCKED' }) },
  @{ id='v2-observation'; status=$(if ($report -and $report.installAllowed -eq $false -and $report.signatureVerified -eq $false -and $report.qualification -eq 'BLOCKED' -and $observation.exitCode -eq 1 -and (!$AuditArchive -or ($report.archive.requiredPeHeaders -eq 'PASS' -and $report.cleanup -eq 'REMOVED'))) { 'PASS' } else { 'BLOCKED' }) },
  @{ id='production-upgrade'; status='NOT EXECUTED'; reason='No independent authorization; trust and directory-transaction gates unresolved' },
  @{ id='v2-runtime'; status='BLOCKED'; reason='No authorized isolated Windows v2 runtime or trusted installation' }
)
# Never persist config, process command lines, session material, raw HTTP or stderr.
$result = @{ schemaVersion=1; checkedAt=[DateTime]::UtcNow.ToString('o'); environment='native Windows permanent checkout'; commit=$head.stdout.Trim(); command="node dist/cli/main.js fqgate $command --json"; observationExitCode=$observation.exitCode; files=$files; listeners=$listeners; checks=$checks; observation=$report }
$result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $evidence -Encoding UTF8
Write-Output "Secret-free evidence: $evidence"
if (@($checks | Where-Object { $_.status -eq 'BLOCKED' }).Count -gt 0) { exit 1 }
