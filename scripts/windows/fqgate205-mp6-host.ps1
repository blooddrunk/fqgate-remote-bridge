[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RepositoryDirectory)
$ErrorActionPreference = 'Stop'

# Read metadata only. Raw CIM commands, service/task names, arguments, environment
# values and executable paths are examined privately and never serialized.
function Get-Mp6HostFacts {
    param([string]$RepositoryDirectory)
    if (-not [IO.Path]::IsPathRooted($RepositoryDirectory)) { throw 'ABSOLUTE_REPOSITORY_REQUIRED' }
    $facts = [ordered]@{
        schemaVersion=1; utc=[DateTime]::UtcNow.ToString('o')
        qualification='LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED'; readiness='BLOCKED'
        exitCause='UNKNOWN_NO_EXIT_HISTORY'; runningArtifact='UNKNOWN'
        counters=@{get=0; post=0; nativeStarts=0; nativeStops=0; repairWrites=0; cloudflareMutations=0}
    }
    $mp6Relevant = {
        param($Text)
        [bool]($Text -and ($Text.IndexOf($RepositoryDirectory,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $Text -match '(?i)fqgate|start-bridge\.mjs'))
    }
    try {
        # Include non-LISTEN rows: some Windows observation views return state 0.
        $rows = @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.LocalPort -in @(17281,17282) })
        if ($rows.Count -gt 256) { throw 'TCP_BOUND' }
        $facts.tcp = @($rows | ForEach-Object {
            @{ port=[int]$_.LocalPort; pid=[int]$_.OwningProcess; loopback=($_.LocalAddress -eq '127.0.0.1')
               state=if([string]$_.State -eq 'Listen' -or [string]$_.State -eq '2') {'LISTEN'} elseif([string]$_.State -eq '0' -or -not $_.State) {'UNKNOWN'} else {'OTHER'} }
        } | Sort-Object { $_.port }, { $_.pid }, { $_.state })
        $facts.tcpStatus='OBSERVED'
    } catch { $facts.tcpStatus='UNREADABLE'; $facts.tcp=@() }
    try {
        $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
        if ($all.Count -gt 32768) { throw 'PROCESS_BOUND' }
        $selected = @($all | Where-Object { $_.Name -ieq 'FQGate.exe' -or ($_.Name -ieq 'node.exe' -and (& $mp6Relevant $_.CommandLine)) })
        if ($selected.Count -gt 64) { throw 'SELECTED_PROCESS_BOUND' }
        $facts.processes = @($selected | Sort-Object ProcessId | ForEach-Object {
            @{pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId
              kind=if($_.Name -ieq 'FQGate.exe') {'FQGATE'} else {'NODE_CANDIDATE'}
              created=if($_.CreationDate) {$_.CreationDate.ToUniversalTime().ToString('o')} else {$null}
              commandReadable=[bool]$_.CommandLine; pathReadable=[bool]$_.ExecutablePath
              startBridgeScript=[bool]($_.CommandLine -match '(?i)start-bridge\.mjs')}
        })
        $facts.processStatus='OBSERVED'
    } catch { $facts.processStatus='UNREADABLE'; $facts.processes=@() }
    try {
        $services = @(Get-CimInstance Win32_Service -ErrorAction Stop)
        if ($services.Count -gt 8192) { throw 'SERVICE_BOUND' }
        $facts.services = @($services | Where-Object { (& $mp6Relevant $_.Name) -or (& $mp6Relevant $_.PathName) } | ForEach-Object {
            @{state=if($_.State -eq 'Running') {'RUNNING'} elseif($_.State -eq 'Stopped') {'STOPPED'} else {'OTHER'}
              startMode=if($_.StartMode -in @('Auto','Manual','Disabled')) {$_.StartMode} else {'UNKNOWN'}
              pid=[int]$_.ProcessId; bridgeInvocation=[bool]($_.PathName -match '(?i)start-bridge\.mjs')
              tunnelInvocation=[bool]($_.PathName -match '(?i)cloudflared')}
        })
        if ($facts.services.Count -gt 64) { throw 'SELECTED_SERVICE_BOUND' }
        $facts.serviceStatus='OBSERVED'
    } catch { $facts.serviceStatus='UNREADABLE'; $facts.services=@() }
    try {
        $tasks = @(Get-ScheduledTask -ErrorAction Stop)
        if ($tasks.Count -gt 8192) { throw 'TASK_BOUND' }
        $facts.tasks = @($tasks | ForEach-Object {
            $task=$_
            $actions=@($task.Actions)
            if($actions.Count -gt 32) { throw 'ACTION_BOUND' }
            $relevant = (& $mp6Relevant $task.TaskName) -or (& $mp6Relevant $task.TaskPath)
            foreach($a in $actions) { if((& $mp6Relevant $a.Execute) -or (& $mp6Relevant $a.Arguments) -or (& $mp6Relevant $a.WorkingDirectory)) { $relevant=$true } }
            if($relevant) {
                @{state=if([string]$task.State -in @('Ready','Running','Disabled')) {[string]$task.State} else {'UNKNOWN'}
                  actionCount=$actions.Count; bridgeInvocation=[bool](@($actions | Where-Object { $_.Arguments -match '(?i)start-bridge\.mjs' }).Count)}
            }
        })
        if ($facts.tasks.Count -gt 64) { throw 'SELECTED_TASK_BOUND' }
        $facts.taskStatus='OBSERVED'
    } catch { $facts.taskStatus='UNREADABLE'; $facts.tasks=@() }
    $facts.environment = @('Process','User','Machine') | ForEach-Object {
        $scope=$_
        try {
            # Presence only, not a dump of the environment or an attested runtime value.
            @{scope=$scope; status='OBSERVED'
              configPresent=[bool][Environment]::GetEnvironmentVariable('FQGATE_REMOTE_BRIDGE_CONFIG',$scope)
              commitPresent=[bool][Environment]::GetEnvironmentVariable('FQGATE_REMOTE_BRIDGE_COMMIT_SHA',$scope)
              buildDirectoryPresent=[bool][Environment]::GetEnvironmentVariable('FQGATE_BRIDGE_BUILD_DIRECTORY',$scope)}
        } catch { @{scope=$scope; status='UNREADABLE'} }
    }
    return $facts
}
if ($MyInvocation.InvocationName -ne '.') {
    try { Get-Mp6HostFacts $RepositoryDirectory | ConvertTo-Json -Depth 8 -Compress }
    catch { Write-Output '{"readiness":"BLOCKED","reason":"HOST_METADATA_UNREADABLE"}'; exit 2 }
}
