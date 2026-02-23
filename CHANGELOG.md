# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

---

## v2.6

### New Features
- **Badge restoration on tab switch** â€” `chrome.tabs.onActivated` handler now restores badge text and difficulty-based color from cached detection data when switching tabs
- **UpdateManager scheduling** â€” Moved `scheduleUpdateCheck()`, `setupUpdateAlarm()`, and `chrome.alarms.onAlarm` listener from `init.js` into `UpdateManager` as `scheduleCheck()`, `setupAlarm()`, and `setupAlarmListener()` static methods
- **`modules/core/constants.js`** â€” Centralized 30+ hardcoded timing values, TTL durations, size limits, and retry configurations into named constants
- **`UrlUtils.getFaviconUrl()` size parameter** â€” Optional second argument for requesting specific favicon resolution (e.g., `64` for webhooks)
- **Expanded `constants.js`** â€” Added 8 new constants: notification timing, log collector limits, and worker keepalive configuration
- **Unified capture state management** â€” All 7 capture-capable providers now use TTLMap from `background.js` with the same Ref/init pattern; eliminated self-declared `Map()` (hCaptcha, ShapeSecurity) and singleton object (AWS WAF)
- **Per-method pagination** â€” Added pagination controls and counters for method patterns in Rules editor, now showing 3 items per page
- **Per-method search** â€” Added section-local pattern search with pagination-aware filtering in Rules editor
- **Version field in detector editor** â€” Added a read-only `Version` field in Detector Information between `Icon` and `Author`
- **Inline loading placeholder** â€” Detection tab shows immediate spinner on popup open instead of blank screen

### Fixes
- **ShapeSecurity tab cleanup** â€” Fixed timeout field name mismatch (`captureTimeout` vs `timeout`) and added missing extraction state cleanup on tab close
- **AWS WAF tab cleanup** â€” Tab close now properly cleans up listeners via `awsWafStopCapture()` instead of only resetting state fields
- **`recentlyClearedTabs` inconsistency** â€” Standardized timeout from inconsistent 5s/10s to consistent 10s across cache and settings handlers
- **Standardized capture timeout** â€” All 7 interceptors now reference `Constants.CAPTURE_AUTO_STOP_TIMEOUT` instead of hardcoded `60000`
- **Hardcoded Google favicon URLs** â€” Replaced inline `google.com/s2/favicons` strings in Akamai, Imperva, reCAPTCHA, and base-advanced-module with `UrlUtils.getFaviconUrl()`
- **Webhook favicon size** â€” Webhook code now uses `UrlUtils.getFaviconUrl(hostname, 64)` instead of hand-built URL with `&sz=64`
- **Inconsistent favicon error handling** â€” Unified Advanced section from `data-hide-on-error` (hide broken image) to `data-fallback` (swap to extension icon), matching History pattern
- **Missing hCaptcha favicon** â€” Added favicon + hostname header to hCaptcha capture history cards, matching all other providers
- **Partial HTML escaping** â€” Replaced 6 instances of incomplete `.replace(/</g, '&lt;').replace(/>/g, '&gt;')` URL escaping in `renderCaptureDetailsContent` overrides with `AdvancedUtils.escapeHtml()` which covers all 5 special characters
- **Detection icon alt-text escaping** â€” Replaced inline `escapeAlt` helper in `detection-ui.js` with `FormatUtils.escapeHtml()`
- **FunCaptcha detail modal timestamp** â€” Changed from `AdvancedUtils.formatTimestamp()` to `new Date().toLocaleString()` matching all other detail modals
- **ShapeSecurity list card timestamp** â€” Changed from `AdvancedUtils.getTimeAgo()` to `this.getTimeAgo()` matching all other providers
- **Favicon fallback selector** â€” Widened `setupExpandListeners` from `.capture-favicon[data-fallback]` to `img[data-fallback]` so all favicon images get error handling
- **History clipboard** â€” Replaced raw `navigator.clipboard.writeText()` with `FormatUtils.copyToClipboard()` for consistent notification + fallback handling
- **Favicon performance** â€” Detection lifecycle now uses Chrome's free `tab.favIconUrl` as primary source instead of making network requests to Google's favicon service
- **Advanced module favicon unification** â€” Capture history now stores `tab.favIconUrl` at capture time; all 7 provider renderers and unified history use the stored favicon with Google service as fallback for old entries
- **Badge API batching** â€” `setBadgeText` and `setBadgeBackgroundColor` now run in parallel via `Promise.all` instead of sequential awaits
- **Non-centralized constants** â€” Moved `DEFAULT_HOOKS_MAX_DETECTION_MS` and `HOOKS_DEADLINE_BUFFER_MS` from `background.js` to `Constants.*`
- **Constants load order** â€” Fixed `constants.js` position in `background.js` importScripts (before `log-collector.js`) and added to manifest ISOLATED world content scripts
- **Logger.warn reclassification** â€” Demoted ~79 informational lifecycle warnings to `Logger.debug` across 20+ files; only ~45 genuine warnings remain
- **Logger.error reclassification** â€” Demoted recoverable errors to `Logger.warn` in detection-engine-manager, history, messages-detection, and init
- **Badge not updating on tab switch** â€” Badge stayed blank when switching to a tab that had completed detection while the user was on another tab; `onActivated` handler now checks `DetectionEngineManager.getDetectionData()` and restores the correct badge
- **Badge stuck on "OFF" after re-enable** â€” Re-enabling the extension only restored the badge for the active tab; all other tabs kept the stale "OFF" badge. Now restores badges for ALL tabs from cached detection data, and `onActivated` clears stale "OFF" badges on tab switch
- **Stale LOADING badge on tab switch** â€” Tabs with interrupted detections kept the loading (â³) badge indefinitely; `onActivated` now clears both stale "OFF" and "LOADING" badges when no cached data exists
- **Badge not synced on popup open** â€” Opening the popup retrieved cached detection data but didn't update the badge; `GET_DETECTION_DATA` handler now fires `setBadgeForDetections()` as a side effect when returning cached data
- **Badge color computation duplication** â€” Extracted `setBadgeForDetections()` shared helper in `utilities.js`, replacing 4 copy-pasted badge-setting blocks across `detection-lifecycle.js`, `tab-events.js`, `messages-settings.js`, and `messages-detection.js`
- **Badge race condition on re-enable** â€” Popup's `handleEnableToggle()` (no context) cleared all badges to EMPTY, racing with background's badge restore; popup now skips badge loop when re-enabling and lets the background handler restore badges correctly
- **Smart search visibility** â€” Search input now hides automatically when a method section has 0 patterns
- **JS Hooks add-row consistency** â€” New `js_hooks` rows now show the same name settings + delete actions as existing rows
- **Save-time required validation** â€” Save is blocked when required pattern fields are empty, with warning feedback and focus to the first invalid row
- **Invalid-row reveal flow** â€” Collapsed/filtered/paginated invalid rows are auto-revealed and focused so they can be fixed quickly
- **Live validation recovery** â€” Invalid highlighting and add-button lock state update immediately as users type or delete rows
- **Unified fingerprint icon frame style** â€” Fingerprint icons now follow the same chip/container framing style as other icons across popup surfaces
- **History duplicate-prevention settings mapping** â€” `Utils.getHistorySettings()` now reads nested `history.*` and `duplicatePrevention.*` keys (with flat legacy fallback), so saved duplicate settings apply correctly at runtime
- **Duplicate prevention write-time enforcement** â€” Added authoritative duplicate blocking in `History.saveDetectionToHistory()` (not only pre-check), with shared key normalization and hostname fallback to prevent new duplicates from slipping through
- **History duplicate matching robustness** â€” Duplicate comparisons now use shared normalized keys for `domain/path/full_url`, including `url -> hostname` fallback for incomplete history entries
- **Unstable faviconV2 reuse** â€” Added favicon normalization/resolution helpers in `UrlUtils` and applied them in History + Advanced save/render paths to stop recurring `t*.gstatic.com/faviconV2` 404 console noise
- **Settings init crash (`setToggleControlledVisibility`)** â€” Fixed missing Settings passthrough and context-fragile helper calls that caused `Failed to initialize sections` and `Failed to load settings. Using defaults.`
- **JS API/Webhook gated visibility consistency** â€” Detection settings now use shared toggle-controlled visibility logic so integration details hide/show reliably with their master toggles

### Removed
- **31 dead methods** â€” Removed unused methods across 15 files: `Utils.performContextCheck`, `DetectorManager.getDetectorsByCategory/getCategoryDetectors`, `CategoryManager.getCategoryDetectors/updateCategoryColor`, `NotificationManager.setBadge/clearBadge` + `NotificationHelper.setBadge/clearBadge`, `PaginationManager.filter`, `LogCollector.getLogsByLevel/copyToClipboard/getStats`, `WorkerKeepaliveManager` 6 methods, `WindowPropertyTracker.applyConfig/cleanup`, `HookResilienceManager` integrity monitoring subsystem (8 methods + 2 constructor fields), `UpdateManager.getLastCheckTimestamp/clearIncompatibleUpdates`, `AdvancedUtils.cleanExpiredHistory/formatTimestamp/getTimeUntil`, `BaseAdvancedModule.getTimeUntil/buildSimpleScriptListSection`, `FormatUtils.getTimeUntil/formatTimestamp`
- **10 dead CSS classes** â€” `.badge-css`, `.badge-default`, `.analysis-step.is-active`, `.analysis-step.is-complete`, `.badge-antibot`, `.badge-anti-bot`, `.capture-card-v2-favicon`, plus corresponding CSS variables
- **6 dead CSS variables** â€” `--danger-lighter`, `--badge-css`, `--shadow`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`
- **Dead CSS class blocks** â€” Removed ~45 unreferenced CSS rules across 3 files: analysis/scoring system (`.analysis-summary`, `.summary-stat`, `.stat-label`, `.stat-value` + score/risk variants, `.detected-systems`, `.systems-list`, `.system-item`, `.recommendations`, `.export-option`, `.error-message` family) and `.capture-card-v2` family (16 selectors) from `advanced.css`; confirm type variants (`.notification-confirm-danger`, `.notification-btn-danger/warning`, `.notification-confirm-warning/info`) and position variants (`.notification-top-left`, `.notification-bottom-right`, `.notification-bottom-left`) from `notification-manager.css`; `.section-title` from `rules.css`
- **Always-hidden HTML generators** â€” Removed `analysis-step-emoji` and `analysis-step-description` DOM generation and their CSS rules
- **Unnecessary global exports** â€” Removed `window.URLHashCache` and `self.URLHashCache` (only used internally by `UrlUtils`)
- **9 duplicate `afterCaptureStart` overrides** â€” Moved to base class default with `displayName` map
- **Dead `getStartNotification` hook** â€” No longer used after `afterCaptureStart` refactor
- **Akamai `checkCaptureState` override** â€” Degraded copy of base class method; base class version is more complete
- **`advanced-analysis.js`** â€” ~440 lines of stub/mock code with no corresponding HTML elements
- **Dead tab focus debounce** â€” Tab switch debounce logic in `tab-events.js` only logged without any functional effect
- **Orphaned HTML elements** â€” Unused `currentTabInfo`, `currentTabFavicon`, `currentTabUrl` from `popup.html`
- **32 `module.exports` blocks** â€” Unreachable CommonJS exports in a Manifest V3 browser extension
- **Redundant `escapeHtml` wrappers** â€” Deleted `AkamaiAdvanced.escapeHtml`, `AkamaiAdvanced.getTimeAgo`, `ImpervaAdvanced.prototype.escapeHtml`, `ShapeSecurityAdvanced.prototype.escapeHtml`, and `Rules.prototype.escapeHtml`
- **No-op `invalidateSettingsCache()`** â€” Empty legacy function and all 5 call sites
- **`AdvancedUtils.getFaviconUrl()` wrapper** â€” One-line delegate to `UrlUtils.getFaviconUrl()`
- **CSS-styled console formatting** â€” Removed all `%c` formatting from log messages
- **Fingerprint-only ring** â€” Eliminated special accent-outline framing that differed from other icon chips
- **Window value-row actions** â€” Removed settings/delete value-row actions for `window` methods while keeping condition controls
- **6 stub lifecycle files** â€” Deleted empty lifecycle stubs for reCAPTCHA, AWS WAF, Geetest, DataDome, Turnstile, and FunCaptcha advanced modules; removed corresponding `<script>` tags from `popup.html`
- **~272 verbose comments** â€” Replaced `// FIX:` prefixes, multi-line explanations, phase/optimization labels, and commit-note comments across ~60 files with concise single-line summaries
- **Dead `scrapfly_cache_*` sessionStorage code** â€” Removed `getCacheKey()` function, 3 `sessionStorage.setItem` writes, 4 `sessionStorage.removeItem` calls, and the `CLEAR_SESSION_CACHE` message handler/sender across `content.js`, `utils.js`, and `detection-engine-manager.js`; these keys were written but never read back (replaced by async `CHECK_CACHE_EARLY` message) and were a fingerprinting risk
- **4 orphaned message sends** â€” Removed `AKAMAI_EXTRACTION_READY` (akamai-interceptor.js), `IMPERVA_ANALYSIS_RESULT` + `notifyImpervaAnalysisUpdate()` function (imperva-interceptor.js), and `CLOUDFLARE_VERSION_DETECTION_RESULT` (cloudflare-interceptor.js); all sent messages that no handler processes
- **2 undefined Geetest message keys** â€” Removed `GEETEST_SHOW_VERSION_NOTIFICATION` and `GEETEST_SHOW_ANALYZING_NOTIFICATION` from handler registry; constants don't exist in `message-types.js` so they resolved to `undefined`
- **Dead `.spinner` CSS** â€” Removed unused `.spinner` class and `@keyframes spin` from `popup.css` (active code uses `.spinner-svg`/`.spinner-circle` pattern)
- **Dead `.empty-state-text`/`.empty-state-footnote` CSS override** â€” Removed `display: none` rule from `detection.css`; these classes only exist in Advanced history, never in detection tab
