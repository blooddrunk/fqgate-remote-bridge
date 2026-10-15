[CmdletBinding()]
param([string]$CurrentDirectory, [string]$ProcessFile)
$ErrorActionPreference = 'Stop'

function Test-QrNativeFacts {
    param($Facts, $Record, [string]$Current)
    $result = [ordered]@{}
    foreach ($port in @(17281, 17282)) {
        $listeners = @($Facts.listeners | Where-Object { $_.port -eq $port })
        $result["LISTENER_$port"] = if ($listeners.Count -eq 0) { 'LISTENER_ABSENT' } elseif ($listeners.Count -ne 1 -or $listeners[0].address -cne '127.0.0.1') { 'LISTENER_NOT_EXCLUSIVE_IPV4_LOOPBACK' } else { 'PASS' }
    }
    $native = $Facts.process
    $expected = [IO.Path]::GetFullPath((Join-Path $Current 'fqgate.exe'))
    $pathMatch = $native -and $native.path -and [IO.Path]::GetFullPath($native.path).Equals($expected, [StringComparison]::OrdinalIgnoreCase)
    $recordMatch = $Record -and $Record.pid -is [int] -and $Record.pid -gt 0 -and $Record.executablePath -and [IO.Path]::GetFullPath($Record.executablePath).Equals($expected, [StringComparison]::OrdinalIgnoreCase)
    $created = [DateTimeOffset]::MinValue
    $creationValid = $native -and [DateTimeOffset]::TryParse([string]$native.created, [ref]$created)
    # Exact v2 diagnostic: a launch-time-only or stale record cannot prove creation identity.
    $recorded = [DateTimeOffset]::MinValue
    $recordTimeValid = $Record -and [DateTimeOffset]::TryParse([string]$Record.startedAt, [ref]$recorded)
    $timeMatch = $creationValid -and $recordTimeValid -and [Math]::Abs(($created - $recorded).TotalMilliseconds) -lt 1
    $result['PROCESS_RECORD'] = if ($result.LISTENER_17281 -eq 'PASS' -and $pathMatch -and $recordMatch -and $native.pid -eq $Record.pid -and $timeMatch) { 'PASS' } else { 'PROCESS_RECORD_NATIVE_IDENTITY_MISMATCH_OR_UNREADABLE' }
    $result['WEBVIEW_PROFILE'] = if ($Facts.profile -ceq 'OUTSIDE_PAYLOAD') { 'PASS' } elseif ($Facts.profile -ceq 'INSIDE_PAYLOAD') { 'WEBVIEW_PROFILE_INSIDE_IMMUTABLE_PAYLOAD' } else { 'WEBVIEW_PROFILE_UNVERIFIED' }
    return $result
}

function Get-QrNativeFacts {
    param([string]$Current)
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(17281, 17282) } | ForEach-Object { @{ port = [int]$_.LocalPort; address = $_.LocalAddress; pid = [int]$_.OwningProcess } })
    $fq = @($listeners | Where-Object { $_.port -eq 17281 })
    $native = $null
    $profile = 'UNVERIFIED'
    if ($fq.Count -eq 1) {
        $p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $fq[0].pid) -ErrorAction Stop
        if ($p -and $p.ExecutablePath -and $p.CreationDate) {
            $native = @{ pid = [int]$p.ProcessId; path = $p.ExecutablePath; created = $p.CreationDate.ToUniversalTime().ToString('o') }
            # Only inspect command lines of WebView descendants, and never emit them.
            $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
            $parents = @([int]$p.ProcessId)
            $views = @()
            for ($depth = 0; $depth -lt 8; $depth++) {
                $children = @($processes | Where-Object { [int]$_.ParentProcessId -in $parents -and [int]$_.ProcessId -notin $parents })
                if ($children.Count -eq 0 -or $children.Count -gt 128) { break }
                $views += @($children | Where-Object { $_.Name -ieq 'msedgewebview2.exe' })
                $parents = @($children | ForEach-Object { [int]$_.ProcessId })
            }
            $paths = @()
            $unreadable = $false
            foreach ($view in $views) {
                if (-not $view.CommandLine) { $unreadable = $true }
                if ($view.CommandLine -match '--user-data-dir=(?:"([^"]+)"|([^\s"]+))') {
                    $directory = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
                    if ([IO.Path]::IsPathRooted($directory)) { $paths += [IO.Path]::GetFullPath($directory) }
                }
            }
            if ($paths.Count -gt 0) {
                $prefix = [IO.Path]::GetFullPath($Current).TrimEnd('\') + '\'
                $inside = @($paths | Where-Object { $_.Equals($prefix.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) -or $_.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })
                $profile = if ($inside.Count -gt 0) { 'INSIDE_PAYLOAD' } elseif ($unreadable) { 'UNVERIFIED' } else { 'OUTSIDE_PAYLOAD' }
            }
        }
    }
    return @{ listeners = $listeners; process = $native; profile = $profile }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $facts = Get-QrNativeFacts $CurrentDirectory
        $record = $null
        try {
            $file = Get-Item -LiteralPath $ProcessFile -ErrorAction Stop
            if ($file.Length -gt 4096 -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid record' }
            $record = Get-Content -LiteralPath $ProcessFile -Raw | ConvertFrom-Json
        } catch { $record = $null }
        $checks = Test-QrNativeFacts $facts $record $CurrentDirectory
        # Return only reduced gates and a private runtime binding, never a command line.
        @{ checks = $checks; binding = $facts.process; powershellVersion = $PSVersionTable.PSVersion.ToString() } | ConvertTo-Json -Depth 8 -Compress
    } catch {
        @{ checks = @{ NATIVE_INSPECTION = 'NATIVE_INSPECTION_FAILED' }; binding = $null } | ConvertTo-Json -Compress
        exit 1
    }
}
