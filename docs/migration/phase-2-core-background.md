# Phase 2 Core + Background (Wave 1)

## Summary
- This phase decomposes two high-coupling hotspots while preserving runtime contracts and classic loader behavior.
- Runtime model is unchanged: `importScripts` in background and ordered classic scripts in popup/content.
- No message/storage schema or public global changes are introduced.

## Delivered Changes

### Background router decomposition
- Added registry and dispatcher utilities:
  - `background/handlers/router-utils.js`
  - `background/handlers/router-registry.js`
- Split message handling by family:
  - `background/handlers/messages-logging.js`
  - `background/handlers/messages-detection.js`
  - `background/handlers/messages-cache.js`
  - `background/handlers/messages-settings.js`
  - `background/handlers/messages-log-collector.js`
  - `background/handlers/messages-advanced-capture.js`
- Reduced `background/handlers/message-router.js` to listener setup + dispatch.
- Updated `background.js` loader order to include all new handler files before router setup.

### Detection engine decomposition
- Added helper modules:
  - `modules/detection/engine/detection-engine-analysis.js`
  - `modules/detection/engine/detection-engine-extractors.js`
  - `modules/detection/engine/detection-engine-matching.js`
  - `modules/detection/engine/detection-engine-hooks.js`
- Kept `DetectionEngineManager` compatibility surface unchanged and delegated these methods to helpers:
  - Analysis: `analyzeUsedMethods`, `needsExternalContent`, `_precomputePriorities`
  - Extractors: `extractCookies`, `extractScriptElements`, `extractDOM`, `getElementAttributes`
  - Matching: `matchCookieName`, `matchPattern`, `matchPatternWithCapture`, `escapeRegExp`
  - Hooks: `generateHookCode`, `createHookBatcher`, `handleHookMessage`
- Updated loaders to include helper scripts before `modules/detection/detection-engine-manager.js` in:
  - `background.js`
  - `popup.html`
  - `manifest.json` content script list

### Guardrails
- Added `scripts/check-contract-invariants.ps1`:
  - Verifies required message type strings are present.
  - Verifies required `scrapfly_*` storage contract keys are present.
  - Exits non-zero when invariants are missing.
- Added `scripts/check-file-size.ps1`:
  - Reports largest JS files.
  - Optional `-FailAbove` threshold for CI.

## Validation Commands
- `Get-ChildItem -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`
- `powershell -ExecutionPolicy Bypass -File scripts/check-rules-duplicates.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/check-global-coupling.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/check-contract-invariants.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/check-file-size.ps1`

## Notes
- `CHECK_FOR_UPDATES` behavior remains unchanged (`Update feature disabled`).
- Unknown background message behavior remains unchanged (`{ status: 'unknown' }`).
- This phase intentionally avoids ES module runtime entrypoint migration.
