[CmdletBinding()]
param(
  [string]$ConfigPath = "D:\code\research\fqgate-acceptance-config.json",
  [string]$EvidencePath = "D:\code\research\fqgate-v2-observation-evidence.json",
  [switch]$AuditArchive
)
$ErrorActionPreference = "Stop"
$repo = 'D:\code\research\fqgate-remote-bridge'
. (Join-Path $PSScriptRoot 'fqgate-v2-observation-gates.ps1')
foreach ($pathArgument in @($ConfigPath, $EvidencePath)) {
  if ($pathArgument -match '["\x00-\x1f]') { throw 'Invalid path argument' }
}
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
$helper = Join-Path $PSScriptRoot 'fqgate-v2-config.mjs'
$command = if ($AuditArchive) { 'audit-v2' } else { 'inspect-v2' }
$script:configExitCode = $null
$operations = @{
  Config = {
    $validation = Invoke-ReadOnly $node ('"' + $helper + '" "' + $repo + '" "' + $ConfigPath + '"')
    $script:configExitCode = $validation.exitCode
    if ($validation.exitCode -ne 0) { throw 'CONFIG_INVALID_OR_UNREADABLE' }
    $config = $validation.stdout | ConvertFrom-Json -ErrorAction Stop
    Join-Path ([IO.Path]::GetFullPath($config.installDirectory)) 'fqgate'
  }
  Snapshot = { param($directory) Get-V2FileSnapshot $directory }
  Listeners = {
    param($directory)
    foreach ($port in @(17281,17282)) {
      $items = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
      foreach ($item in $items) {
        $identity = 'UNREADABLE'
        try {
          $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.OwningProcess)" -ErrorAction Stop
          if ($process.ExecutablePath) {
            if ($port -eq 17281 -and [IO.Path]::GetFullPath($process.ExecutablePath) -ieq (Join-Path $directory 'current\fqgate.exe')) { $identity='MANAGED_PATH_MATCH' }
            else { $identity='MISMATCH' }
          }
        } catch { }
        @{ port=$port; address=$item.LocalAddress; pid=$item.OwningProcess; identity=$identity }
      }
    }
  }
  Observe = { Invoke-ReadOnly $node ('"' + $cli + '" fqgate ' + $command + ' --json') }
}
$result = Invoke-V2ObservationChecks $operations ([bool]$AuditArchive)
$headAfter = Invoke-ReadOnly $git "$gitArgs rev-parse HEAD"
$statusAfter = Invoke-ReadOnly $git "$gitArgs status --porcelain"
$result.checks += New-V2Gate 'permanent-checkout-unchanged' ($headAfter.exitCode -eq 0 -and $statusAfter.exitCode -eq 0 -and $headAfter.stdout -ceq $head.stdout -and $statusAfter.stdout -ceq $status.stdout) 'Checkout SHA and porcelain state unchanged; no files/branch/operator-state overwritten'
$result.commands = @(
  @{ command='git -c safe.directory=D:/code/research/fqgate-remote-bridge rev-parse HEAD (before)'; exitCode=$head.exitCode },
  @{ command='git -c safe.directory=D:/code/research/fqgate-remote-bridge status --porcelain (before)'; exitCode=$status.exitCode },
  @{ command='node fqgate-v2-config.mjs <permanent-repository> <config-file>'; exitCode=$script:configExitCode },
  @{ command="node dist/cli/main.js fqgate $command --json"; exitCode=$result.observationExitCode },
  @{ command='git rev-parse HEAD (after)'; exitCode=$headAfter.exitCode },
  @{ command='git status --porcelain (after)'; exitCode=$statusAfter.exitCode }
)
$result.checks += New-V2Gate 'permanent-checkout-clean' (!$status.stdout.Trim()) 'Operator changes are preserved; no checkout synchronization'
$result.schemaVersion = 2
$result.checkedAt = [DateTime]::UtcNow.ToString('o')
$result.environment = 'native Windows permanent checkout'
$result.commit = $head.stdout.Trim()
$result.command = "node dist/cli/main.js fqgate $command --json"
$result.sourceHashes = @{}
foreach ($source in @($PSCommandPath, (Join-Path $PSScriptRoot 'fqgate-v2-observation-gates.ps1'), $helper, $cli, (Join-Path $repo 'dist\fqgate\release\v2-inspection.js'), (Join-Path $repo 'dist\fqgate\release\v2-archive.js'), (Join-Path $repo 'dist\config\config.js'))) {
  $result.sourceHashes[[IO.Path]::GetFileName($source)] = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
}
# No configuration, command lines, raw stdout/stderr, JWT/session material or errors are persisted.
$result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $evidence -Encoding UTF8
Write-Output "Secret-free evidence: $evidence"
exit $result.exitCode
