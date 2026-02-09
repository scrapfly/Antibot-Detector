param(
    [string]$RepoRoot = ".",
    [string]$OutputPath = "scripts/reports/global-coupling.json",
    [string]$BaselinePath = ""
)

$ErrorActionPreference = "Stop"

function Get-AbsolutePath([string]$PathValue, [string]$BasePath) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

function Get-IntOrZero([object]$Value) {
    if ($null -eq $Value) {
        return 0
    }
    return [int]$Value
}

try {
    $scriptDir = Split-Path -Parent $PSCommandPath
    $defaultRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))
    $resolvedRepoRoot = if ($RepoRoot -eq "." -or [string]::IsNullOrWhiteSpace($RepoRoot)) {
        $defaultRepoRoot
    } else {
        Get-AbsolutePath -PathValue $RepoRoot -BasePath (Get-Location).Path
    }

    if (-not (Test-Path $resolvedRepoRoot)) {
        throw "Repository root not found: $resolvedRepoRoot"
    }

    $resolvedOutputPath = Get-AbsolutePath -PathValue $OutputPath -BasePath $resolvedRepoRoot
    $outputDirectory = Split-Path -Parent $resolvedOutputPath
    if (-not (Test-Path $outputDirectory)) {
        New-Item -Path $outputDirectory -ItemType Directory -Force | Out-Null
    }

    $jsFiles = Get-ChildItem -Path $resolvedRepoRoot -Recurse -File -Filter "*.js" | Where-Object {
        $_.FullName -notmatch "[\\/]\.git[\\/]" -and $_.FullName -notmatch "[\\/]node_modules[\\/]"
    }

    $patterns = [ordered]@{
        windowAssignments = "(?m)\bwindow\.[A-Za-z_][A-Za-z0-9_]*\s*="
        moduleExports = "(?m)\bmodule\.exports\b"
        rulesPrototype = "Rules\.prototype\."
        detectionRequests = "\bDetectionRequests\b"
        settingsUI = "\bSettingsUI\b"
        settingsRuntime = "\bSettingsRuntime\b"
    }

    $counts = [ordered]@{
        windowAssignments = 0
        moduleExports = 0
        rulesPrototype = 0
        detectionRequests = 0
        settingsUI = 0
        settingsRuntime = 0
    }

    foreach ($file in $jsFiles) {
        $content = Get-Content -Path $file.FullName -Raw
        if ($null -eq $content) {
            $content = ""
        }
        foreach ($patternName in $patterns.Keys) {
            $matchCount = [regex]::Matches($content, $patterns[$patternName]).Count
            $counts[$patternName] += $matchCount
        }
    }

    $prototypeRegistryTotal =
        $counts.rulesPrototype +
        $counts.detectionRequests +
        $counts.settingsUI +
        $counts.settingsRuntime

    $report = [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        repoRoot = $resolvedRepoRoot
        filesScanned = $jsFiles.Count
        counts = [ordered]@{
            windowAssignments = $counts.windowAssignments
            moduleExports = $counts.moduleExports
            prototypeRegistry = [ordered]@{
                rulesPrototype = $counts.rulesPrototype
                detectionRequests = $counts.detectionRequests
                settingsUI = $counts.settingsUI
                settingsRuntime = $counts.settingsRuntime
                total = $prototypeRegistryTotal
            }
        }
    }

    $reportJson = $report | ConvertTo-Json -Depth 8
    Set-Content -Path $resolvedOutputPath -Value $reportJson -Encoding UTF8

    Write-Host ("Global coupling report written to {0}" -f $resolvedOutputPath)
    Write-Host ("filesScanned={0}" -f $jsFiles.Count)
    Write-Host ("windowAssignments={0}" -f $counts.windowAssignments)
    Write-Host ("moduleExports={0}" -f $counts.moduleExports)
    Write-Host ("prototypeRegistry.total={0}" -f $prototypeRegistryTotal)

    if (-not [string]::IsNullOrWhiteSpace($BaselinePath)) {
        $resolvedBaselinePath = Get-AbsolutePath -PathValue $BaselinePath -BasePath $resolvedRepoRoot
        if (-not (Test-Path $resolvedBaselinePath)) {
            throw "Baseline file not found: $resolvedBaselinePath"
        }

        $baseline = Get-Content -Path $resolvedBaselinePath -Raw | ConvertFrom-Json

        $baselineFlat = [ordered]@{
            windowAssignments = Get-IntOrZero $baseline.counts.windowAssignments
            moduleExports = Get-IntOrZero $baseline.counts.moduleExports
            rulesPrototype = Get-IntOrZero $baseline.counts.prototypeRegistry.rulesPrototype
            detectionRequests = Get-IntOrZero $baseline.counts.prototypeRegistry.detectionRequests
            settingsUI = Get-IntOrZero $baseline.counts.prototypeRegistry.settingsUI
            settingsRuntime = Get-IntOrZero $baseline.counts.prototypeRegistry.settingsRuntime
            prototypeRegistryTotal = Get-IntOrZero $baseline.counts.prototypeRegistry.total
        }

        $currentFlat = [ordered]@{
            windowAssignments = $counts.windowAssignments
            moduleExports = $counts.moduleExports
            rulesPrototype = $counts.rulesPrototype
            detectionRequests = $counts.detectionRequests
            settingsUI = $counts.settingsUI
            settingsRuntime = $counts.settingsRuntime
            prototypeRegistryTotal = $prototypeRegistryTotal
        }

        $increases = @()
        foreach ($key in $currentFlat.Keys) {
            if ($currentFlat[$key] -gt $baselineFlat[$key]) {
                $increases += [PSCustomObject]@{
                    metric = $key
                    baseline = $baselineFlat[$key]
                    current = $currentFlat[$key]
                }
            }
        }

        if ($increases.Count -gt 0) {
            Write-Host "Coupling counts increased versus baseline:" -ForegroundColor Red
            foreach ($row in $increases) {
                Write-Host (" - {0}: baseline={1}, current={2}" -f $row.metric, $row.baseline, $row.current) -ForegroundColor Red
            }
            exit 1
        }

        Write-Host "No coupling metric increases versus baseline." -ForegroundColor Green
    }

    exit 0
} catch {
    Write-Error ("Failed to generate coupling report: {0}" -f $_.Exception.Message)
    exit 1
}
