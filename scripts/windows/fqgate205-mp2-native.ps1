[CmdletBinding()]
param([string]$WorkerPids = '')
$ErrorActionPreference = 'Stop'
function Test-Mp2PathSafe {
    param([string]$Path)
    if (-not [IO.Path]::IsPathRooted($Path)) { return $false }
    $cursor = [IO.Path]::GetFullPath($Path); $remaining = 64
    try {
        while ($cursor -and $remaining -gt 0) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
            $cursor = [IO.Path]::GetDirectoryName($cursor); $remaining--
        }
        return ($remaining -gt 0)
    } catch { return $false }
}
function Get-Mp2Listeners {
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(17281,17282) } | ForEach-Object { @{ port=[int]$_.LocalPort; address=$_.LocalAddress; pid=[int]$_.OwningProcess } } | Sort-Object { $_.port }, { $_.address }, { $_.pid })
}
function Get-Mp2Process {
    param([int]$ProcessId)
    $p = @(Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $ProcessId) -ErrorAction Stop)
    if ($p.Count -ne 1 -or -not $p[0].ExecutablePath -or -not $p[0].CreationDate) { throw 'PROCESS_UNREADABLE' }
    $p = $p[0]
    if ([int]$p.ProcessId -ne $ProcessId) { throw 'PROCESS_ID_MISMATCH' }
    # No command line, environment, account/session or WebView content leaves CIM.
    return @{ pid=[int]$p.ProcessId; parentPid=[int]$p.ParentProcessId; path=$p.ExecutablePath; created=$p.CreationDate.ToUniversalTime().ToString('o'); pathSafe=(Test-Mp2PathSafe $p.ExecutablePath) }
}
function Get-Mp2NativeFacts {
    param([string]$WorkerPids)
    $ids = @()
    if ($WorkerPids) {
        if ($WorkerPids -cnotmatch '^\d+(,\d+){0,15}$') { throw 'Invalid bounded PID set' }
        $ids = @($WorkerPids.Split(',') | ForEach-Object { $v = [int]$_; if ($v -le 0) { throw 'Invalid PID' }; $v })
    }
    $listeners = @(Get-Mp2Listeners)
    if ($listeners.Count -gt 32) { throw 'Listener bound exceeded' }
    $ids += @($listeners | ForEach-Object { $_.pid })
    $processes = @($ids | Select-Object -Unique | ForEach-Object { Get-Mp2Process $_ })
    # Re-observe every selected process and listener: ParentProcessId alone cannot
    # attribute a worker to a reused parent PID. Preserve seven creation decimals.
    foreach ($p in $processes) {
        $after = Get-Mp2Process $p.pid
        foreach ($key in @('pid','parentPid','path','created','pathSafe')) {
            if ($after[$key] -cne $p[$key]) { throw 'PROCESS_IDENTITY_CHANGED' }
        }
    }
    if ((ConvertTo-Json -InputObject $listeners -Compress) -cne (ConvertTo-Json -InputObject @(Get-Mp2Listeners) -Compress)) { throw 'LISTENER_CHANGED' }
    return @{listeners=$listeners; processes=$processes}
}
if ($MyInvocation.InvocationName -ne '.') {
    try { Get-Mp2NativeFacts $WorkerPids | ConvertTo-Json -Depth 6 -Compress }
    catch { Write-Output '{"error":"NATIVE_INSPECTION_UNREADABLE_OR_UNSTABLE"}'; exit 1 }
}
