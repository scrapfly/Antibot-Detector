param(
    [string]$RepoRoot = "."
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

    $sourceFiles = Get-ChildItem -Path $resolvedRepoRoot -Recurse -File | Where-Object {
        $_.Extension -in @(".js", ".json", ".md") -and
        $_.FullName -notmatch "[\\/]\.git[\\/]" -and
        $_.FullName -notmatch "[\\/]node_modules[\\/]"
    }

    $combined = New-Object System.Text.StringBuilder
    foreach ($file in $sourceFiles) {
        [void]$combined.AppendLine((Get-Content -Path $file.FullName -Raw))
    }
    $haystack = $combined.ToString()

    $requiredMessageTypes = @(
        'AKAMAI_CAPTURE_COMPLETED',
        'AKAMAI_EXTRACTION_COMPLETED',
        'AKAMAI_EXTRACT_SENSOR',
        'AKAMAI_GET_CAPTURE_STATE',
        'AKAMAI_SHOW_ANALYZING_NOTIFICATION',
        'AKAMAI_SHOW_EXTRACTING_NOTIFICATION',
        'AKAMAI_START_CAPTURE',
        'AKAMAI_STOP_CAPTURE',
        'AWSWAF_GET_STATE',
        'AWSWAF_SHOW_ANALYZING_NOTIFICATION',
        'AWSWAF_START_ANALYSIS',
        'AWSWAF_START_CAPTURE',
        'AWSWAF_STOP_CAPTURE',
        'CACHE_HIT_EARLY_EXIT',
        'CACHE_SCOPE_CHANGED',
        'CATEGORY_COLORS_UPDATED',
        'CHECK_CACHE_EARLY',
        'CHECK_FOR_UPDATES',
        'CLEAR_DETECTION_CACHE',
        'CLEAR_DETECTION_DATA',
        'CLOUDFLARE_CHECK_VERSION',
        'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION',
        'CLOUDFLARE_START_ANALYSIS',
        'CONTENT_SCRIPT_READY',
        'DATADOME_SHOW_ANALYZING_NOTIFICATION',
        'DATADOME_START_ANALYSIS',
        'DEBUG_LOG',
        'DETECTION_DATA',
        'EXTENSION_TOGGLE_CHANGED',
        'FUNCAPTCHA_CAPTURE_COMPLETED',
        'FUNCAPTCHA_GET_CAPTURE_STATE',
        'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
        'FUNCAPTCHA_START_ANALYSIS',
        'FUNCAPTCHA_START_CAPTURE',
        'FUNCAPTCHA_STOP_CAPTURE',
        'GEETEST_ANALYZE_SCRIPTS',
        'GEETEST_CHECK_VERSION',
        'GEETEST_SHOW_ANALYZING_NOTIFICATION',
        'GEETEST_SHOW_VERSION_NOTIFICATION',
        'GET_DETECTION_DATA',
        'GET_DETECTORS',
        'HCAPTCHA_CAPTURE_COMPLETED',
        'HCAPTCHA_CHECK_VERSION',
        'HCAPTCHA_GET_CAPTURE_STATE',
        'HCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
        'HCAPTCHA_SHOW_VERSION_NOTIFICATION',
        'HCAPTCHA_START_ANALYSIS',
        'HCAPTCHA_START_CAPTURE',
        'HCAPTCHA_STOP_CAPTURE',
        'HOOK_FAILURE_REPORT',
        'HOOK_RECOVERY_RESULT',
        'HOOK_TAMPERING_DETECTED',
        'IMPERVA_CAPTURE_COMPLETED',
        'IMPERVA_EXTRACT_SCRIPTS',
        'IMPERVA_GET_CAPTURE_STATE',
        'IMPERVA_SHOW_ANALYZING_NOTIFICATION',
        'IMPERVA_START_CAPTURE',
        'IMPERVA_STOP_CAPTURE',
        'JS_HOOKS_COMPLETE',
        'JS_HOOK_DETECTION',
        'JS_HOOK_DETECTION_BATCH',
        'LOG',
        'LOG_COLLECTOR_CLEAR',
        'LOG_COLLECTOR_DISABLE',
        'LOG_COLLECTOR_ENABLE',
        'LOG_COLLECTOR_EXPORT_JSON',
        'LOG_COLLECTOR_EXPORT_TEXT',
        'LOG_COLLECTOR_GET_COUNT',
        'LOG_COLLECTOR_SET_MAX_LOGS',
        'PAGE_LOAD_NOTIFICATION',
        'PING',
        'RECAPTCHA_GET_CAPTURE_RESULTS',
        'RECAPTCHA_GET_CAPTURE_STATE',
        'RECAPTCHA_START_CAPTURE',
        'RECAPTCHA_STOP_CAPTURE',
        'RELOAD_DETECTORS',
        'REQUEST_DETECTION',
        'SCRAPFLY_DEBUG_LOG',
        'SETTINGS_UPDATED',
        'SHAPESECURITY_ANALYZE_SCRIPTS',
        'SHAPESECURITY_CHECK_COOKIES',
        'SHAPESECURITY_CHECK_HEADERS',
        'SHAPESECURITY_CHECK_VERSION',
        'SHAPESECURITY_EXTRACTION_COMPLETED',
        'SHAPESECURITY_GET_CAPTURE_STATE',
        'SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION',
        'SHAPESECURITY_START_CAPTURE',
        'SHAPESECURITY_START_EXTRACTION',
        'SHAPESECURITY_STOP_CAPTURE',
        'SYNC_CATEGORY_COLORS',
        'TURNSTILE_SHOW_ANALYZING_NOTIFICATION',
        'TURNSTILE_START_ANALYSIS',
        'WINDOW_DETECTIONS',
        'WINDOW_PROPS_COMPLETE'
    )

    $requiredStorageKeys = @(
        'scrapfly_enabled',
        'scrapfly_settings',
        'scrapfly_detectors',
        'scrapfly_categories',
        'scrapfly_detection_storage',
        'scrapfly_detection_state',
        'scrapfly_detection_states',
        'scrapfly_history',
        'scrapfly_advanced_history',
        'scrapfly_js_hook_detections',
        'scrapfly_collected_logs',
        'scrapfly_log_collector_enabled',
        'scrapfly_log_collector_max',
        'scrapfly_pending_updates',
        'scrapfly_incompatible_updates',
        'scrapfly_last_update_check',
        'scrapfly_update_errors',
        'scrapfly_cache_'
    )

    $missingMessages = @()
    foreach ($messageType in $requiredMessageTypes) {
        if ($haystack.IndexOf($messageType, [System.StringComparison]::Ordinal) -lt 0) {
            $missingMessages += $messageType
        }
    }

    $missingStorageKeys = @()
    foreach ($storageKey in $requiredStorageKeys) {
        if ($haystack.IndexOf($storageKey, [System.StringComparison]::Ordinal) -lt 0) {
            $missingStorageKeys += $storageKey
        }
    }

    if ($missingMessages.Count -gt 0 -or $missingStorageKeys.Count -gt 0) {
        if ($missingMessages.Count -gt 0) {
            Write-Host "Missing message types:" -ForegroundColor Red
            foreach ($msg in $missingMessages) {
                Write-Host (" - {0}" -f $msg) -ForegroundColor Red
            }
        }

        if ($missingStorageKeys.Count -gt 0) {
            Write-Host "Missing storage keys:" -ForegroundColor Red
            foreach ($key in $missingStorageKeys) {
                Write-Host (" - {0}" -f $key) -ForegroundColor Red
            }
        }

        exit 1
    }

    Write-Host ("Contract invariants verified. messageTypes={0}, storageKeys={1}" -f $requiredMessageTypes.Count, $requiredStorageKeys.Count) -ForegroundColor Green
    exit 0
} catch {
    Write-Error ("Failed to validate contract invariants: {0}" -f $_.Exception.Message)
    exit 1
}
