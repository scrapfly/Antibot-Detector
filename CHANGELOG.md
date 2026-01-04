## v2.4

### Bug Fixes
- **Fix badge/popup desync** - Popup now correctly shows detection results when badge displays count
  - Root cause: Badge updates early (in processDetectionData), but cache write happens later (in finalizeDetection)
  - Fix: Check badge count and use `state.mainData` directly without waiting for `state.expiry`
- **Fix "Extension context invalidated" errors** - Logger now gracefully handles extension reload
- **Fix memory leaks** - Clean up `finalizationDebounce` and `batchProcessingFlags` Maps on tab close/URL change
- **Fix race condition** - Properly await `processDetectionData()` in DETECTION_DATA handler
- **Fix JS hooks not working after enabling** - Notify background.js to reload detectors when toggling enabled state
  - Root cause: Rules UI saved to storage but background.js kept stale detectors in memory
  - Fix: Send `RELOAD_DETECTORS` message after toggling detector enabled state
- **Fix CSP inline event handler violations** - Replace 18 inline handlers with CSP-compliant alternatives
  - Replace `onclick/onmouseover/onmouseout` with CSS classes and event delegation
  - Replace `onerror` on images with `data-fallback` + addEventListener
  - Files fixed: settings.js, history.js, advanced.js, rules.js, recaptcha-advanced.js, awswaf-advanced.js
- **Fix inconsistent JS hook detection counts** - Increase MAX_DETECTION_MS from 3s to 8s
  - Root cause: 3-second hard timeout was too short for sites with lazy-loaded fingerprinting
  - Fix: Extend maximum detection window to 8 seconds (2s inactivity timeout still ensures fast completion)
  - Added logging for unfired hooks to help debug future issues
- **Fix cache hit race condition causing inconsistent hook counts** - Check sessionStorage on every hook
  - Root cause: ISOLATED and MAIN worlds have separate `window` objects, so cache flags don't sync
  - Fix: Check sessionStorage (which IS shared) on every `reportHookDetection()` call
  - Now consistently skips hooks when cache hit is detected, regardless of timing
- **Fix sessionStorage not being saved after detection** - Save after DETECTION_DATA response
  - Root cause: sessionStorage was only saved on cache HIT (visit 2), not after detection (visit 1)
  - This caused first refresh to always re-run hooks before async cache check returned
  - Fix: Save sessionStorage in utils.js after successful DETECTION_DATA send so visit 2 skips hooks

### Documentation
- **Updated README** with new screenshots and improved documentation
  - Added hero banner and feature screenshots
  - Updated architecture diagrams with detection flow
  - Added version badge (v2.4)
  - Improved installation and development instructions
- **Added assets folder** with Chrome Web Store promotional images

### Code Cleanup
- Remove ~200 lines of dead code:
  - `createPaginationHTML()` from pagination-manager.js
  - `getCategoryIcon()`, `updateBadgeColor()` from category-manager.js
  - `stringifyJSON()` from utils.js
  - Unused `DOMCache` class from advanced-utils.js
- Replace duplicate utility functions in advanced-utils.js with delegations to Utils.js
- Add `destroy()` cleanup method to ImpervaAdvanced module

---

## v2.3

### Removed
- Remove update-manager.js auto-update module (simplify extension)
- Remove `alarms` permission (no longer needed)

---

## v2.2

What's New in v2.2

### Fingerprint Detection Changes
- **Disable all 21 fingerprint detectors by default** - Users can enable individually in Settings
- Add `fingerprintEnabled` check for inline hooks - Respects detector enabled state
- Skip disabled detectors entirely when building hook definitions

### Bug Fixes
- **Fix Shape Security false positives** (GitHub issue #4) - Add regex anchors to header patterns
- Add missing `exists` condition to CONDITION_EVALUATORS for window properties
- Fix window property detection when using "exists" condition from UI

### Code Cleanup
- Remove sessionStorage usage for debug mode (chrome.storage only)
- Remove sessionStorage usage for cache cleared flag
- Simplify cache hit detection flow
