[CmdletBinding()]
param(
    [switch]$DryRun,
    [ValidateRange(5, 300)][int]$FetchTimeoutSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$mirrorPrefix = 'https://ghfast.top/'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$workspaceRoot = Split-Path -Parent $projectRoot
$originalWorktree = Join-Path $workspaceRoot 'Mineradio-main'
$lxWorktree = Join-Path $workspaceRoot 'Mineradio-LX-Music-main'
$lockPath = Join-Path $projectRoot 'upstream-lock.json'

function Invoke-GitText {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = @(& git -C $Repository @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed in $Repository`n$($output -join [Environment]::NewLine)"
    }

    return ($output -join "`n").Trim()
}

function Stop-ProcessTree {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId
    )

    $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
    $killer = Start-Process -FilePath $taskkill `
        -ArgumentList @('/PID', $ProcessId, '/T', '/F') `
        -NoNewWindow -PassThru -Wait

    if ($killer.ExitCode -ne 0) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 500
}

function Invoke-GitFetch {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Refspec
    )

    $arguments = @(
        '-C', ('"{0}"' -f $Repository),
        '-c', 'http.lowSpeedLimit=1',
        '-c', 'http.lowSpeedTime=20',
        'fetch', '--depth=1', '--no-tags', $Url, $Refspec
    )
    $process = Start-Process -FilePath 'git.exe' -ArgumentList $arguments -NoNewWindow -PassThru

    if (-not $process.WaitForExit($FetchTimeoutSeconds * 1000)) {
        Write-Warning "Fetch exceeded ${FetchTimeoutSeconds}s; stopping PID $($process.Id)."
        Stop-ProcessTree -ProcessId $process.Id
        return 124
    }

    return $process.ExitCode
}

function Fetch-RemoteBranch {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string]$Remote,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $officialUrl = Invoke-GitText -Repository $Repository -Arguments @('remote', 'get-url', $Remote)
    $urls = @($officialUrl, "${mirrorPrefix}${officialUrl}")
    $refspec = "+refs/heads/main:${Destination}"

    foreach ($url in $urls) {
        Write-Host "Fetching $Remote from $url"
        if ($DryRun) {
            return
        }

        $exitCode = Invoke-GitFetch -Repository $Repository -Url $url -Refspec $refspec
        if ($exitCode -eq 0) {
            return
        }

        Write-Warning "Fetch failed with exit code $exitCode; trying the next URL."
    }

    throw "Unable to fetch $Remote for $Repository"
}

function Update-ReadOnlyWorktree {
    param(
        [Parameter(Mandatory = $true)][string]$Repository
    )

    if (-not (Test-Path -LiteralPath (Join-Path $Repository '.git'))) {
        throw "Git worktree not found: $Repository"
    }

    $branch = Invoke-GitText -Repository $Repository -Arguments @('branch', '--show-current')
    if ($branch -ne 'main') {
        throw "Expected main branch in $Repository, found: $branch"
    }

    $changes = Invoke-GitText -Repository $Repository -Arguments @('status', '--porcelain')
    if ($changes) {
        throw "Upstream worktree has local changes: $Repository"
    }

    Fetch-RemoteBranch -Repository $Repository -Remote 'origin' -Destination 'refs/remotes/origin/main'
    if (-not $DryRun) {
        [void](Invoke-GitText -Repository $Repository -Arguments @('merge', '--ff-only', 'refs/remotes/origin/main'))
    }
}

Write-Host 'Updating read-only upstream worktrees...'
Update-ReadOnlyWorktree -Repository $originalWorktree
Update-ReadOnlyWorktree -Repository $lxWorktree

Write-Host 'Updating Mineradio-Next remote references...'
Fetch-RemoteBranch -Repository $projectRoot -Remote 'upstream-original' -Destination 'refs/remotes/upstream-original/main'
Fetch-RemoteBranch -Repository $projectRoot -Remote 'upstream-lx' -Destination 'refs/remotes/upstream-lx/main'

if ($DryRun) {
    Write-Host 'Dry run completed. No repository or lock-file changes were made.'
    exit 0
}

$originalCommit = Invoke-GitText -Repository $projectRoot -Arguments @('rev-parse', 'refs/remotes/upstream-original/main')
$lxCommit = Invoke-GitText -Repository $projectRoot -Arguments @('rev-parse', 'refs/remotes/upstream-lx/main')

$lock = [ordered]@{
    schemaVersion = 1
    updatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
    original = [ordered]@{
        repository = 'https://github.com/XxHuberrr/Mineradio.git'
        branch = 'main'
        commit = $originalCommit
    }
    lx = [ordered]@{
        repository = 'https://github.com/ww085213/Mineradio-LX-Music.git'
        branch = 'main'
        commit = $lxCommit
    }
}

$json = $lock | ConvertTo-Json -Depth 4
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($lockPath, $json + [Environment]::NewLine, $utf8WithoutBom)

Write-Host "Original: $originalCommit"
Write-Host "LX:       $lxCommit"
Write-Host "Updated:  $lockPath"
