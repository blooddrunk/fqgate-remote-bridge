[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CurrentDirectory)
$ErrorActionPreference = 'Stop'

# Native reads only. Command lines are examined in memory for two worker switches
# and WebView directory placement; no raw command, path or native source ID is emitted.
function Get-Mp3TopologyFacts {
    param([string]$CurrentDirectory)
    if (-not [IO.Path]::IsPathRooted($CurrentDirectory)) { throw 'Absolute directory required' }
    $prefix = [IO.Path]::GetFullPath($CurrentDirectory).TrimEnd('\') + '\'
    $expected = $prefix + 'FQGate.exe'
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    if ($all.Count -gt 32768) { throw 'Process inventory bound exceeded' }
    $apps = @($all | Where-Object { $_.Name -ieq 'FQGate.exe' })
    if ($apps.Count -gt 32) { throw 'Application count bound exceeded' }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(17281,17282) })
    $parents = @($apps | Where-Object { [int]$_.ParentProcessId -notin @($apps | ForEach-Object { [int]$_.ProcessId }) })
    $workers = @($apps | Where-Object { [int]$_.ParentProcessId -in @($parents | ForEach-Object { [int]$_.ProcessId }) })
    $views = @()
    $ids = @($apps | ForEach-Object { [int]$_.ProcessId })
    $seen = @($ids)
    for($depth=0; $depth -lt 8; $depth++) {
        $children = @($all | Where-Object { [int]$_.ParentProcessId -in $ids -and [int]$_.ProcessId -notin $seen })
        if ($children.Count -gt 128) { throw 'Descendant bound exceeded' }
        if ($children.Count -eq 0) { break }
        $views += @($children | Where-Object { $_.Name -ieq 'msedgewebview2.exe' })
        $ids = @($children | ForEach-Object { [int]$_.ProcessId }); $seen += $ids
        if ($depth -eq 7) { throw 'Descendant depth unproven' }
    }
    $directories = @(); $directoryUnknown = 0; $inside = 0; $linkUnknown = 0; $reparse = 0
    foreach($view in $views) {
        if ($view.CommandLine -and $view.CommandLine -match '--user-data-dir=(?:"([^"]+)"|([^\s"]+))') {
            $directory = if($Matches[1]) { $Matches[1] } else { $Matches[2] }
            if(-not [IO.Path]::IsPathRooted($directory)) { $directoryUnknown++; continue }
            $directory = [IO.Path]::GetFullPath($directory).TrimEnd('\')
            $directories += $directory.ToLowerInvariant()
            if($directory.Equals($prefix.TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase) -or $directory.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { $inside++ }
            # Attributes of ancestors only; never enumerate/read WebView profile files.
            $cursor=$directory; $remaining=64
            try {
                while($cursor -and $remaining -gt 0) {
                    $item=Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
                    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $reparse++ }
                    $cursor=[IO.Path]::GetDirectoryName($cursor); $remaining--
                }
                if($remaining -eq 0) { $linkUnknown++ }
            } catch { $linkUnknown++ }
        } else { $directoryUnknown++ }
    }
    $processes = @($apps | Sort-Object ProcessId | ForEach-Object {
        @{
            pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId
            created=if($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }
            expectedExecutable=([bool]$_.ExecutablePath -and $_.ExecutablePath.Equals($expected,[StringComparison]::OrdinalIgnoreCase))
            sourceWorkerSwitch=([bool]$_.CommandLine -and $_.CommandLine -match '(?:^|\s)--source-worker(?:\s|$)')
            parentSwitch=([bool]$_.CommandLine -and $_.CommandLine -match '(?:^|\s)--source-worker-parent-pid(?:\s|=)')
            workingSetBytes=[long]$_.WorkingSetSize
        }
    })
    return @{
        evidence='OBSERVED'; parentCount=$parents.Count; workerCount=$workers.Count; processes=$processes
        listeners=@($listeners | ForEach-Object { @{port=[int]$_.LocalPort; loopback=($_.LocalAddress -eq '127.0.0.1'); pid=[int]$_.OwningProcess} })
        bridgeStatus=if(@($listeners | Where-Object {$_.LocalPort -eq 17282}).Count -eq 0) {'BLOCKED_LISTENER_ABSENT'} else {'OBSERVED_NOT_BUILD_VERIFIED'}
        webview=@{processCount=$views.Count; distinctObservedRoots=@($directories | Select-Object -Unique).Count; directoryUnknown=$directoryUnknown; insidePayloadCount=$inside; reparseCount=$reparse; linkUnknown=$linkUnknown}
        storageIndependence='UNPROVEN'; lifecycleExperiment='NOT_EXECUTED'; independentLaunchContract='UNPROVEN'
    }
}
if ($MyInvocation.InvocationName -ne '.') {
    try { Get-Mp3TopologyFacts $CurrentDirectory | ConvertTo-Json -Depth 8 -Compress }
    catch { Write-Output '{"evidence":"BLOCKED","reason":"NATIVE_READ_UNAVAILABLE"}'; exit 1 }
}
