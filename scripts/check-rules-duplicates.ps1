param(
    [string]$RulesFile = "sections/rules/rules.js",
    [string]$RulesRoot = "sections/rules",
    [string[]]$ExcludeFiles = @(
        "sections/rules/rules.js",
        "sections/rules/helpers/helper-modals.js"
    )
)

$ErrorActionPreference = "Stop"
$repoRoot = (Get-Location).Path

function Normalize-RelativePath([string]$Path) {
    $candidate = $Path
    if ([System.IO.Path]::IsPathRooted($Path)) {
        $fullPath = [System.IO.Path]::GetFullPath($Path)
        $fullRoot = [System.IO.Path]::GetFullPath($repoRoot)
        if ($fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $candidate = $fullPath.Substring($fullRoot.Length).TrimStart('\', '/')
        } else {
            $candidate = $fullPath
        }
    }
    return ($candidate -replace "\\", "/").Trim().ToLowerInvariant()
}

if (-not (Test-Path $RulesFile)) {
    Write-Error "Rules file not found: $RulesFile"
    exit 1
}

if (-not (Test-Path $RulesRoot)) {
    Write-Error "Rules root not found: $RulesRoot"
    exit 1
}

$normalizedRulesFile = Normalize-RelativePath $RulesFile
$normalizedExcludes = @($ExcludeFiles | ForEach-Object { Normalize-RelativePath $_ })

$extensionFiles = @(
    Get-ChildItem -Path $RulesRoot -Recurse -File -Filter "*.js" |
        ForEach-Object { Normalize-RelativePath $_.FullName } |
        Where-Object { $_ -notin $normalizedExcludes } |
        Sort-Object -Unique
)

if ($extensionFiles.Count -eq 0) {
    Write-Warning "No Rules extension files discovered under $RulesRoot."
}

$classContent = Get-Content $RulesFile -Raw
$classMethodMatches = [regex]::Matches(
    $classContent,
    "(?m)^ {2}(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{"
)
$skipNames = @(
    "if","for","while","switch","catch","try","return",
    "const","let","var","function","else","new"
)
$classMethods = @{}
foreach ($match in $classMethodMatches) {
    $name = $match.Groups[1].Value
    if (-not $name) { continue }
    if ($name -eq "constructor") { continue }
    if ($skipNames -contains $name) { continue }
    $classMethods[$name] = $normalizedRulesFile
}

$extensionMethodsToFiles = @{}
foreach ($file in $extensionFiles) {
    if (-not (Test-Path $file)) {
        Write-Warning "Extension file not found, skipping: $file"
        continue
    }

    $content = Get-Content $file -Raw
    $matches = [regex]::Matches($content, "Rules\.prototype\.([A-Za-z_][A-Za-z0-9_]*)\s*=")
    foreach ($match in $matches) {
        $name = $match.Groups[1].Value
        if (-not $name) { continue }
        if (-not $extensionMethodsToFiles.ContainsKey($name)) {
            $extensionMethodsToFiles[$name] = New-Object System.Collections.Generic.HashSet[string]
        }
        [void]$extensionMethodsToFiles[$name].Add($file)
    }
}

$classVsExtension = @{}
foreach ($name in $classMethods.Keys) {
    if ($extensionMethodsToFiles.ContainsKey($name)) {
        $classVsExtension[$name] = @($extensionMethodsToFiles[$name] | Sort-Object)
    }
}

$extensionVsExtension = @{}
foreach ($name in $extensionMethodsToFiles.Keys) {
    $files = @($extensionMethodsToFiles[$name] | Sort-Object)
    if ($files.Count -gt 1) {
        $extensionVsExtension[$name] = $files
    }
}

$hasDuplicates = ($classVsExtension.Count -gt 0) -or ($extensionVsExtension.Count -gt 0)

if ($hasDuplicates) {
    Write-Host "Duplicate Rules method definitions found." -ForegroundColor Red

    if ($classVsExtension.Count -gt 0) {
        Write-Host "" 
        Write-Host "Class-vs-extension duplicates:" -ForegroundColor Red
        foreach ($name in ($classVsExtension.Keys | Sort-Object)) {
            Write-Host (" - {0}" -f $name) -ForegroundColor Red
            Write-Host ("    class: {0}" -f $normalizedRulesFile) -ForegroundColor Red
            foreach ($file in $classVsExtension[$name]) {
                Write-Host ("    extension: {0}" -f $file) -ForegroundColor Red
            }
        }
    }

    if ($extensionVsExtension.Count -gt 0) {
        Write-Host ""
        Write-Host "Extension-vs-extension duplicates:" -ForegroundColor Red
        foreach ($name in ($extensionVsExtension.Keys | Sort-Object)) {
            Write-Host (" - {0}" -f $name) -ForegroundColor Red
            foreach ($file in $extensionVsExtension[$name]) {
                Write-Host ("    extension: {0}" -f $file) -ForegroundColor Red
            }
        }
    }

    exit 1
}

Write-Host "No duplicate Rules method definitions found." -ForegroundColor Green
exit 0
