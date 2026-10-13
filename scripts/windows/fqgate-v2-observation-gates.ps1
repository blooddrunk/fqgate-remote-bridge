# Pure gates and read-only orchestration shared by permanent observation and CI fixtures.
# No fixture mode or injected operations are exposed by the production entrypoint.
Set-StrictMode -Version Latest
function New-V2Gate([string]$Id, [bool]$Pass, [string]$Reason) {
  @{ id=$Id; status=$(if ($Pass) { 'PASS' } else { 'BLOCKED' }); reason=$Reason }
}
function Get-V2FileSnapshot([string]$Directory) {
  $files = @{}
  foreach ($relative in @('current\fqgate.exe','previous\fqgate.exe','state.json','process.json','install.lock','transaction.json')) {
    try {
      $path = Join-Path $Directory $relative
      $present = Test-Path -LiteralPath $path -PathType Leaf -ErrorAction Stop
      $files[$relative] = @{ present=$present; readable=$true }
      if ($present) {
        $files[$relative].bytes = (Get-Item -LiteralPath $path -ErrorAction Stop).Length
        $files[$relative].sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
      }
    } catch { $files[$relative] = @{ present=$null; readable=$false } }
  }
  $files
}
function Test-V2Snapshots($Before, $After) {
  if (!$Before -or !$After -or $Before.Count -ne 6 -or $After.Count -ne 6) { return $false }
  foreach ($key in $Before.Keys) {
    if (!$After.ContainsKey($key) -or !$Before[$key].readable -or !$After[$key].readable) { return $false }
    if ($Before[$key].present -cne $After[$key].present) { return $false }
    if ($Before[$key].present -and ($Before[$key].bytes -ne $After[$key].bytes -or $Before[$key].sha256 -cne $After[$key].sha256)) { return $false }
  }
  return $true
}
function ConvertTo-V2SafeReport($Result, [bool]$AuditArchive) {
  # Never persist untrusted CLI objects wholesale. Exceptions carry no raw payload.
  if ($Result.exitCode -ne 1 -or $Result.stdout.Length -gt 131072) { throw 'CLI_EXIT_OR_SIZE' }
  $r = $Result.stdout | ConvertFrom-Json -ErrorAction Stop
  if ($r.schemaVersion -ne 1 -or $r.trust -cne 'UNAUTHENTICATED_OBSERVATION' -or
      $r.signatureVerified -isnot [bool] -or $r.signatureVerified -ne $false -or
      $r.installAllowed -isnot [bool] -or $r.installAllowed -ne $false -or
      $r.runtimeQualified -isnot [bool] -or $r.runtimeQualified -ne $false -or
      $r.qualification -cne 'BLOCKED' -or $r.version -cnotmatch '^2\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$') { throw 'REPORT_INVALID' }
  foreach ($key in @('freshness','stable','release','githubRelease')) {
    if ($r.metadataHashes.$key -cnotmatch '^[a-f0-9]{64}$') { throw 'HASH_INVALID' }
  }
  foreach ($key in @('sequence','refreshSequence')) {
    if ($r.$key -isnot [long] -and $r.$key -isnot [int]) { throw 'SEQUENCE_INVALID' }
    if ($r.$key -le 0) { throw 'SEQUENCE_INVALID' }
  }
  if ($r.windows.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $r.windows.bytes -le 0 -or
      $r.windows.bytes -gt 134217728 -or $r.windows.fileName -cne "FQGate-$($r.version)-windows-x64.zip") { throw 'ASSET_INVALID' }
  $published = [DateTimeOffset]::Parse($r.publishedAt)
  if ($published -gt [DateTimeOffset]::UtcNow) { throw 'FUTURE_METADATA' }
  $safe = @{ schemaVersion=1; version=$r.version; publishedAt=$published.ToUniversalTime().ToString('o');
    sequence=$r.sequence; refreshSequence=$r.refreshSequence; signatureVerified=$false;
    installAllowed=$false; runtimeQualified=$false; qualification='BLOCKED';
    metadataHashes=@{}; windows=@{ bytes=$r.windows.bytes; sha256=$r.windows.sha256; fileName=$r.windows.fileName } }
  foreach ($key in @('freshness','stable','release','githubRelease')) { $safe.metadataHashes[$key] = $r.metadataHashes.$key }
  if ($AuditArchive) {
    if ($r.cleanup -cne 'REMOVED' -or $r.archive.requiredPeHeaders -cne 'PASS' -or
        $r.archive.entries -lt 2 -or $r.archive.entries -gt 512 -or
        $r.archive.uncompressedBytes -le 0 -or $r.archive.uncompressedBytes -gt 268435456) { throw 'ARCHIVE_INVALID_OR_NOT_REMOVED' }
    $safe.archive = @{ entries=$r.archive.entries; uncompressedBytes=$r.archive.uncompressedBytes; requiredPeHeaders='PASS' }
    $safe.cleanup = 'REMOVED'
  }
  $safe
}
function Invoke-V2ObservationChecks([hashtable]$Operations, [bool]$AuditArchive) {
  $checks = @(); $before=$null; $after=$null; $report=$null; $result=$null; $listeners=@()
  $configValid=$false
  try { $directory = & $Operations.Config; $configValid = ![string]::IsNullOrWhiteSpace($directory) } catch { }
  $checks += New-V2Gate 'config' $configValid 'Existing schema validation; invalid/unreadable config forbids production-path inspection'
  if ($configValid) {
    try { $before = & $Operations.Snapshot $directory } catch { }
    try { $listeners = @(& $Operations.Listeners $directory) } catch { $listeners=@() }
    foreach ($port in @(17281,17282)) {
      $matches = @($listeners | Where-Object { $_.port -eq $port })
      $checks += New-V2Gate "loopback-$port" ($matches.Count -eq 1 -and $matches[0].address -ceq '127.0.0.1') 'Exactly one IPv4 loopback listener required; absence/IPv6/wildcard/duplicates deny'
    }
    $matches = @($listeners | Where-Object { $_.port -eq 17281 })
    $checks += New-V2Gate 'managed-process' ($matches.Count -eq 1 -and $matches[0].identity -ceq 'MANAGED_PATH_MATCH') 'Unreadable/mismatched owner path denies; do not adopt or terminate'
    $previous = $before -and $before.ContainsKey('previous\fqgate.exe') -and $before['previous\fqgate.exe'].readable -and $before['previous\fqgate.exe'].present -and $before['previous\fqgate.exe'].bytes -gt 0
    $checks += New-V2Gate 'previous-present' $previous 'Nonempty readable previous required; presence alone does not qualify rollback'
    $clear = $before -and $before['install.lock'].readable -and !$before['install.lock'].present -and $before['transaction.json'].readable -and !$before['transaction.json'].present
    $checks += New-V2Gate 'transaction-clear' $clear 'Never clear a lock or incomplete transaction'
  } else {
    foreach ($id in @('loopback-17281','loopback-17282','managed-process','previous-present','transaction-clear')) {
      $checks += @{ id=$id; status='NOT_EXECUTED'; reason='CONFIG_INVALID_OR_UNREADABLE' }
    }
  }
  try { $result = & $Operations.Observe; $report = ConvertTo-V2SafeReport $result $AuditArchive } catch { }
  finally { if ($configValid) { try { $after = & $Operations.Snapshot $directory } catch { } } }
  $checks += New-V2Gate 'v2-observation' ($null -ne $report) 'Exit 1 requires valid blocked report; malformed metadata/crash/exit 0 or 2 deny; no raw response saved'
  if ($AuditArchive) { $checks += New-V2Gate 'zip-cleanup' ($null -ne $report -and $report.cleanup -ceq 'REMOVED') 'Successful archive audit must report completed removal; crash cleanup is not assumed' }
  $checks += New-V2Gate 'production-files-unchanged' (Test-V2Snapshots $before $after) 'Compare before/after presence, readability, size and SHA256 for all six fixed files, including on CLI failure'
  $blockers = @(
    @{ id='publisher-signature'; reason='BLOCKED_UPSTREAM_SIGNING_CONTRACT: no independently authenticated release root/algorithm/input/rotation/revocation'; resolver='Publisher must supply verifiable contract and independent key channel'; resumeCommand='node dist/cli/main.js fqgate inspect-v2 --json (observation only, not unblocking)' },
    @{ id='metadata-freshness-anti-replay'; reason='No authenticated persistent sequence/expiry policy; coherent historical replay cannot pass'; resolver='Publisher contract then separately reviewed deterministic verifier and durable state'; resumeCommand='pnpm test (after contract-backed implementation; no security-state reset)' },
    @{ id='directory-rollback'; reason='v2 directory activation/crash recovery/rollback unimplemented; v1 previous presence is insufficient'; resolver='Separately authorized directory transaction task'; resumeCommand='NONE: no safe v2 activation/rollback command exists' },
    @{ id='v2-runtime'; reason='Trusted artifact and separately authorized isolated Windows environment absent'; resolver='Publisher trust plus explicit isolated-runtime authorization'; resumeCommand='NONE: R1 does not authorize v2 execution' }
  )
  foreach ($gate in $blockers) { $gate.status='BLOCKED'; $checks += $gate }
  $checks += @{ id='production-upgrade'; status='NOT_EXECUTED'; reason='Outside R1 authorization' }
  @{ checks=$checks; filesBefore=$before; filesAfter=$after; listeners=$listeners; observation=$report;
    observationExitCode=$(if ($result) { $result.exitCode } else { $null });
    exitCode=1 }
}
