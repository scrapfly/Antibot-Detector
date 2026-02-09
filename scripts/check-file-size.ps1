param(
    [string]$RepoRoot = ".",
    [int]$Top = 25,
    [int]$FailAbove = 0
)

$ErrorActionPreference = "Stop"

function Get-AbsolutePath([string]$PathValue, [string]$BasePath) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
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

    $jsFiles = Get-ChildItem -Path $resolvedRepoRoot -Recurse -File -Filter "*.js" | Where-Object {
        $_.FullName -notmatch "[\\/]\.git[\\/]" -and $_.FullName -notmatch "[\\/]node_modules[\\/]"
    }

    $rows = foreach ($file in $jsFiles) {
        $lineCount = (Get-Content -Path $file.FullName).Count
        [PSCustomObject]@{
            Lines = $lineCount
            File = $file.FullName.Substring($resolvedRepoRoot.Length + 1).Replace('\', '/')
        }
    }

    $sorted = $rows | Sort-Object -Property Lines -Descending
    $topRows = $sorted | Select-Object -First $Top

    Write-Host ("Largest JavaScript files (top {0})" -f $Top)
    $topRows | Format-Table -AutoSize

    if ($FailAbove -gt 0) {
        $violations = $sorted | Where-Object { $_.Lines -gt $FailAbove }
        if ($violations.Count -gt 0) {
            Write-Host ("Files above {0} lines:" -f $FailAbove) -ForegroundColor Red
            $violations | Format-Table -AutoSize
            exit 1
        }
    }

    exit 0
} catch {
    Write-Error ("Failed to report file sizes: {0}" -f $_.Exception.Message)
    exit 1
}
