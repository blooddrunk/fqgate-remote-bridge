[CmdletBinding()]
param([string]$WorkerPids = '')
$ErrorActionPreference = 'Stop'
function Get-Mp2NativeFacts {
    param([string]$WorkerPids)
    $ids = @()
    if ($WorkerPids) {
        if ($WorkerPids -cnotmatch '^\d+(,\d+){0,15}$') { throw 'Invalid bounded PID set' }
        $ids = @($WorkerPids.Split(',') | ForEach-Object { $v = [int]$_; if ($v -le 0) { throw 'Invalid PID' }; $v })
    }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(17281,17282) } | ForEach-Object { @{ port=[int]$_.LocalPort; address=$_.LocalAddress; pid=[int]$_.OwningProcess } })
    $ids += @($listeners | ForEach-Object { $_.pid })
    $processes = @($ids | Select-Object -Unique | ForEach-Object {
        $p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $_) -ErrorAction Stop
        if ($p -and $p.ExecutablePath -and $p.CreationDate) {
            # No command line, environment, account, session, or WebView data leaves CIM.
            @{ pid=[int]$p.ProcessId; parentPid=[int]$p.ParentProcessId; path=$p.ExecutablePath; created=$p.CreationDate.ToUniversalTime().ToString('o') }
        }
    })
    return @{listeners=$listeners; processes=$processes}
}
if ($MyInvocation.InvocationName -ne '.') {
    try { Get-Mp2NativeFacts $WorkerPids | ConvertTo-Json -Depth 6 -Compress }
    catch { Write-Output '{"error":"NATIVE_INSPECTION_UNAVAILABLE"}'; exit 1 }
}
