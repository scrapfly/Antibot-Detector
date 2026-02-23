# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

---

## v2.6

### Logging Audit

- **Logger.warn reclassification** — Demoted ~79 informational lifecycle warnings to `Logger.debug` across 20+ files; only ~45 genuine warnings remain (validation failures, load errors, timeouts)
- **Logger.error reclassification** — Demoted recoverable errors to `Logger.warn` in detection-engine-manager (11), history (15), messages-detection (5), and init (3); removed redundant stack trace lines
- **CSS-styled console cleanup** — Removed all `%c` formatting from log messages that only rendered in Service Worker console
- **Message format standardization** — Added `[functionName]` prefixes to all plain-text log messages in content.js and messages-detection.js; consolidated verbose multi-line diagnostic dumps into single structured calls with data objects
- **Silent console with Debug Mode OFF** — `WARN` and `ERROR` are now reserved for real problems; normal lifecycle events use `Logger.debug` (gated by debugMode)

### Advanced Module Cleanup

- **Remove 9 duplicate `afterCaptureStart` overrides** — All providers had identical implementations; moved to base class default with `displayName` map for human-readable notification names
- **Remove dead `getStartNotification` hook** — No longer used after `afterCaptureStart` refactor; removed from base class, Akamai, and ShapeSecurity
- **Remove Akamai `checkCaptureState` override** — Degraded copy of base class method (missing `isCapturing` flag and return value); base class version is more complete
- **Delete `advanced-analysis.js`** — ~440 lines of stub/mock code (random scores, "coming soon!" messages) with no corresponding HTML elements; removed file and script tag

### Capture State Unification

- **Unified capture state management** — All 7 capture-capable providers now use TTLMap from `background.js` with the same Ref/init pattern; eliminated self-declared `Map()` (hCaptcha, ShapeSecurity) and singleton object (AWS WAF)
- **Fix ShapeSecurity tab cleanup** — Fixed timeout field name mismatch (`captureTimeout` vs `timeout`) and added missing extraction state cleanup on tab close
- **Fix AWS WAF tab cleanup** — Tab close now properly cleans up listeners via `awsWafStopCapture()` instead of only resetting state fields

### Constants Centralization

- **Created `modules/core/constants.js`** — Centralized 30+ hardcoded timing values, TTL durations, size limits, and retry configurations into named constants
- **Fixed `recentlyClearedTabs` inconsistency** — Standardized timeout from inconsistent 5s/10s to consistent 10s across cache and settings handlers
- **Standardized capture timeout** — All 7 interceptors now reference `Constants.CAPTURE_AUTO_STOP_TIMEOUT` instead of hardcoded `60000`

### Dead Code Removal

- **Removed dead tab focus debounce** — Tab switch debounce logic in `tab-events.js` only logged without any functional effect; removed `tabFocusTimestamps` and `TAB_SWITCH_DEBOUNCE_MS`
- **Removed orphaned HTML elements** — Unused `currentTabInfo`, `currentTabFavicon`, `currentTabUrl` from `popup.html`
- **Removed 32 `module.exports` blocks** — Unreachable CommonJS exports in a Manifest V3 browser extension

### Favicon Unification

#### Fixed
- **Hardcoded Google favicon URLs** — Replaced inline `google.com/s2/favicons` strings in Akamai, Imperva, reCAPTCHA, and base-advanced-module with `UrlUtils.getFaviconUrl()`
- **Webhook favicon size** — Webhook code now uses `UrlUtils.getFaviconUrl(hostname, 64)` instead of hand-built URL with `&sz=64`
- **Inconsistent error handling** — Unified Advanced section from `data-hide-on-error` (hide broken image) to `data-fallback` (swap to extension icon), matching History pattern
- **Missing hCaptcha favicon** — Added favicon + hostname header to hCaptcha capture history cards, matching all other providers

#### Added
- **`UrlUtils.getFaviconUrl()` size parameter** — Optional second argument for requesting specific favicon resolution (e.g., `64` for webhooks)

#### Removed
- **Dead `.capture-card-v2-favicon` CSS** — Unreferenced class in `advanced.css`

### Codebase Consistency Cleanup

#### Fixed
- **Partial HTML escaping** — Replaced 6 instances of incomplete `.replace(/</g, '&lt;').replace(/>/g, '&gt;')` URL escaping in `renderCaptureDetailsContent` overrides (base, hCaptcha, AWS WAF, Cloudflare, reCAPTCHA) with `AdvancedUtils.escapeHtml()` which covers all 5 special characters
- **Detection icon alt-text escaping** — Replaced inline `escapeAlt` helper in `detection-ui.js` with `FormatUtils.escapeHtml()`
- **FunCaptcha detail modal timestamp** — Changed from `AdvancedUtils.formatTimestamp()` to `new Date().toLocaleString()` matching all other detail modals
- **ShapeSecurity list card timestamp** — Changed from `AdvancedUtils.getTimeAgo()` to `this.getTimeAgo()` matching all other providers
- **Favicon fallback selector** — Widened `setupExpandListeners` from `.capture-favicon[data-fallback]` to `img[data-fallback]` so all favicon images (including hCaptcha inline-styled ones) get error handling
- **History clipboard** — Replaced raw `navigator.clipboard.writeText()` with `FormatUtils.copyToClipboard()` for consistent notification + fallback handling

#### Removed
- **Redundant `escapeHtml` wrappers** — Deleted `AkamaiAdvanced.escapeHtml` (static), `AkamaiAdvanced.getTimeAgo` (static), `ImpervaAdvanced.prototype.escapeHtml`, `ShapeSecurityAdvanced.prototype.escapeHtml`, and `Rules.prototype.escapeHtml`; all call sites now use `AdvancedUtils.escapeHtml()` or `FormatUtils.escapeHtml()` directly

### Cleanup & Optimization

#### Added
- **Expanded `constants.js`** — Added 8 new constants: notification timing, log collector limits, and worker keepalive configuration

#### Removed
- **Dead CSS `.badge-antibot`/`.badge-anti-bot`** — Unused selectors and CSS variable `--badge-antibot` not referenced in any JS or HTML
- **No-op `invalidateSettingsCache()`** — Empty legacy function and all 5 call sites across settings, detection, history, and update-manager
- **`AdvancedUtils.getFaviconUrl()` wrapper** — One-line delegate to `UrlUtils.getFaviconUrl()`; callers now use `UrlUtils` directly

#### Fixed
- **Favicon performance** — Detection lifecycle now uses Chrome's free `tab.favIconUrl` as primary source instead of making network requests to Google's favicon service on every detection
- **Badge API batching** — `setBadgeText` and `setBadgeBackgroundColor` now run in parallel via `Promise.all` instead of sequential awaits (4 call sites)

### Rules Editor and Pattern Management

- **Add Pattern label unification** - Standardized method section action labels to `Add Pattern`
- **Per-method pagination** - Added pagination controls and counters for method patterns, now showing **3 items per page**
- **Per-method search** - Added section-local pattern search with pagination-aware filtering
- **Smart search visibility** - Search input now hides automatically when a method section has `0 patterns`
- **JS Hooks add-row consistency** - New `js_hooks` rows now show the same name settings + delete actions as existing rows
- **Window value-row cleanup** - Removed settings/delete value-row actions for `window` methods while keeping condition controls
- **Single-empty-row guard** - `Add Pattern` is disabled per section when any required pattern name/path field is empty
- **Save-time required validation** - Save is blocked when required pattern fields are empty, with warning feedback and focus to the first invalid row
- **Invalid-row reveal flow** - Collapsed/filtered/paginated invalid rows are auto-revealed and focused so they can be fixed quickly
- **Live validation recovery** - Invalid highlighting and add-button lock state update immediately as users type or delete rows

### Detector Modal Improvements

- **Version field in editor** - Added a read-only `Version` field in Detector Information between `Icon` and `Author`
- **Version display defaults** - Shows detector version when editing and `1.0` for new detectors
- **Change button styling** - Updated icon `Change` action to the same blue primary style used by key modal actions

### Fingerprint Icon Visual Consistency

- **Unified icon frame style** - Fingerprint icons now follow the same chip/container framing style as Scrapfly/reCAPTCHA icons across popup surfaces
- **Removed fingerprint-only ring** - Eliminated special accent-outline framing that differed from other icon chips
- **Blue fingerprint glyph treatment** - Kept fingerprint icon glyphs/images blue while preserving neutral shared containers
- **Modal/icon picker alignment** - Applied the same fingerprint styling behavior in Rules edit/add preview and Choose Icon modal

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
