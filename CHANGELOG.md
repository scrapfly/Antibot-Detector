# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

---

## v2.5

### UI Redesign

- **Full UI overhaul** - Redesigned all major sections: Detection, History, Rules, and Settings tabs
- **Window Properties Helper** - New 3-step wizard: Enter Keyword → Choose Property → Select Condition
- **Detection state cards** - Unified card system for empty, disabled, and interrupted states
- **Settings modal** - Refreshed layout and improved organization
- **Icons** - New icons throughout the UI for better visual clarity
- **Copy overview button** - Quick copy of detection results in detection tab
- **Badge DISABLED color** - Changed from gray to orange for better visibility
- **Quick action buttons** - Color-coded buttons: delete (red), clear (yellow), copy (blue), disable (grey)
- **Scrollbar accent** - Updated to blue accent theme
- **Modal height** - Reduced max height from 600px to 400px

### New Features

- **Author field** - Detectors now support an `author` field displayed in the rules UI
- **Schema versioning** - Detector index now includes `schemaVersion` and `detectorIdPrefix`
- **Hook diagnostics** - New diagnostic messages for hook failures, tampering detection, and recovery
- **Log collector settings** - New `logCollectorEnabled` and `logCollectorMaxLogs` settings
- **JS API improvements** - Console logging when JS API is enabled; new events: `scrapfly:ready`, `scrapfly:onProgress`, `scrapfly:onHooksComplete`, `scrapfly:onWindowPropsComplete`, `scrapfly:onError`
- **Click-to-copy** - Usage examples and event names in settings are click-to-copy
- **Webhook label** - Clarified to "Send on every page load (bypass cache)"

### Detector Improvements

- **Detector ID rename** - All 48 detectors renamed from `name` to `detect-name` convention (e.g., `akamai` → `detect-akamai`)
- **Confidence recalibration** - Generic content patterns reduced from 80-95 to 50 to lower false positives
- **Quality pass** - Improved patterns, descriptions, and accuracy across all detectors
- **Author standardization** - Normalized to "Scrapfly" across all detectors

### Bug Fixes

- **Fix Logger display** - Error data now stringified instead of showing `[object Object]`
- **Fix DetectionEngineManager** - Restored 10 methods lost during module reorganization
- **Fix DetectionEngineManager STORAGE_KEY** - Restored missing constant for detection cache storage
- **Fix TDZ error** - Changed `let` to `var` for background script manager variables to prevent temporal dead zone errors
- **Fix handleTabActivation** - Removed call to never-implemented method
- **Fix color picker overflow** - Resolved color picker extending outside card boundaries
- **Fix rule editor version** - No longer auto-increments version when no changes are made
- **Fix rule editor timestamp** - Skip `lastUpdated` update when saving without changes
- **Fix modal button z-index** - Resolve click-through issue with z-index layering
- **Fix timestamp reference error** - Prevent error when saving rules without changes
- **Fix JS API setting** - Resolve configuration not being applied correctly
- **Fix detection item display** - Show matched value instead of regex pattern in history
- **Fix author capitalization** - Default author displays as "Scrapfly" (capitalized)
- **Fix JS API console toggle** - Console logging now follows JS API enabled state automatically

### Code Cleanup

- **Module reorganization** - Restructured into domain-based hierarchy: core, detection, reliability, UI, and styles
- **Background decomposition** - Extracted header capture, utilities, and lifecycle modules from background.js
- **Utils decomposition** - Split into focused modules: FormatUtils, UrlUtils, DetectionUtils
- **Rules consolidation** - Merged editor files, unified pattern helpers, added modal lifecycle base class
- **Settings split** - Separated runtime-safe APIs from UI logic
- **CSS design system** - New shared `common.css` with CSS custom properties, replacing duplicated styles
- **Dead code removal** - Removed ~800 lines of unused code including SearchManager, unused utility methods, and deprecated modules
