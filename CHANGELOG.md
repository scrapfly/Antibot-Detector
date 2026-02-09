# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

---

## v2.5 (Unreleased)

### Architecture Refactor

- **Module reorganization** - Restructured flat `modules/` directory into domain-based hierarchy:
  - `modules/core/` - Logger, StorageManager, UpdateManager, TTLMap, BadgeManager
  - `modules/detection/` - DetectorManager, CategoryManager, ConfidenceManager, DetectionEngineManager, DetectionStateManager
  - `modules/reliability/` - HookResilienceManager, WindowPropertyTracker, WorkerKeepaliveManager, WindowConditionLanguage
  - `modules/ui/` - PaginationManager, SearchManager, ColorManager, NotificationManager
  - `modules/styles/` - Consolidated CSS (popup, detection, history, settings, advanced, notification-manager)
- **Rules section modularization** - Split monolithic rules.js into focused modules:
  - `rules-handlers.js` - Event handling
  - `rules-display.js` - Rendering and display logic
  - `rules-formatters.js` - Data formatting helpers
  - `modals/explanation-modals.js` - Explanation modal UI
  - `modals/icon-picker-modal.js` - Icon picker modal
  - `helpers/helper-modals.js` - Helper modal utilities
- **Background router split (phase 1)** - Moved service-worker routing/lifecycle code into:
  - `background/handlers/message-router.js`
  - `background/detection-lifecycle.js`
  - `background/tab-events.js`
  - `background/init.js`
  - `background.js` now acts as bootstrap/orchestrator
- **Detection split (phase 3)** - Moved `Detection` responsibilities into:
  - `sections/detection/detection-requests.js` (static request/process flow)
  - `sections/detection/detection-ui.js` (rendering and state views)
  - `sections/detection/detection-actions.js` (cache/blacklist/user actions)
  - `sections/detection/detection-modals.js` (copy/modal flows)
  - `sections/detection/detection.js` now keeps core wiring and compatibility methods
- **Settings split (phase 4)** - Split runtime-safe and UI logic:
  - `sections/settings/settings-runtime.js` (background/content/popup static APIs)
  - `sections/settings/settings-ui.js` (modal UI/event logic)
  - `sections/settings/settings.js` now keeps the compatibility class and delegates methods
- **Loader normalization (phase 5)** - Updated script order and runtime boundaries:
  - `popup.html` now loads section core files first, then extension files
  - `background.js` and `manifest.json` now load `settings-runtime.js` in non-popup contexts
- **Rules guardrail script** - Added `scripts/check-rules-duplicates.ps1` to detect duplicate method definitions between `rules.js` and `rules-*` extension files
- **Detection UI state machine** - New `detection-state.js` for managing detection section UI states
- **New TTLMap module** - LRU cache with TTL eviction extracted to dedicated class
- **New BadgeManager** - Badge logic extracted from badge-constants.js into proper manager class
- **New WindowConditionLanguage** - Dedicated module for evaluating window property conditions

### New Features

- **Author field in detector system** - Detectors now support an `author` field displayed in the rules UI
- **Schema versioning** - Added `schemaVersion: "1.1.0"` and `detectorIdPrefix` to `detectors/index.json`
- **Hook diagnostics** - New message types: `HOOK_FAILURE_REPORT`, `HOOK_TAMPERING_DETECTED`, `HOOK_RECOVERY_RESULT`
- **Log collector settings** - New `logCollectorEnabled` and `logCollectorMaxLogs` general settings
- **JS API console logging** - Automatically logs events to page console when JS API is enabled
- **Expanded JS API events** - Added new events: `scrapfly:ready`, `scrapfly:onProgress`, `scrapfly:onHooksComplete`, `scrapfly:onWindowPropsComplete`, `scrapfly:onError`
- **Click-to-copy in settings** - Usage example code block and event names are click-to-copy
- **Webhook label clarification** - "Send on every page load (bypass cache)" for clearer intent

### Detector Improvements

- **Detector ID rename** - Renamed all detectors from `name` to `detect-name` convention for consistency (e.g., `akamai` → `detect-akamai`)
- **Confidence score recalibration** - Reviewed and improved confidence scores across all 48 detectors, reducing generic content pattern confidence from 80-95 to 50 to reduce false positives
- **URL pattern confidence boost** - Increased high-specificity URL patterns to 100 confidence (e.g., reCAPTCHA)
- **Overall detector quality pass** - Improved detection patterns, descriptions, and accuracy across all antibot, CAPTCHA, and fingerprint detectors
- **Author standardization** - Normalized author field to "Scrapfly" (capitalized) across all detectors

### UI Redesign

- **Full UI overhaul** - Redesigned all major sections: Detection, History, Rules, and Settings tabs
- **Window Properties Helper redesigned** - New 3-step wizard UI with Enter Keyword, Choose Property, and Select Condition flow
- **Settings modal redesigned** - Refreshed layout and improved organization
- **Detection state cards redesigned** - Unified `state-card` CSS class system replacing separate empty/disabled/interrupted styles
- **Icons added** - New icons throughout the UI for better visual clarity
- **Copy overview button** - New "Copy overview" button in detection tab
- **Badge DISABLED color** - Changed from gray (#6b7280) to orange (#f97316) for better visibility
- **Modal height reduced** - Max height from 600px to 400px
- **Scrollbar accent color** - Updated to blue accent theme
- **Quick action buttons** - New color-coded action buttons for delete (red), clear (yellow), copy (blue), and disable (grey)

### Bug Fixes

- **Fix color picker overflow** - Resolved color picker extending outside card boundaries (7 progressive fixes)
- **Fix rule editor version increment** - No longer auto-increments version when no changes are made
- **Fix rule editor timestamp** - Skip `lastUpdated` update when no changes are made
- **Fix modal button z-index** - Resolve click-through issue with z-index layering
- **Fix timestamp reference error** - Prevent error when saving rules without changes
- **Fix JS API setting** - Resolve issue with JS API configuration not being applied correctly
- **Fix detection item display** - Show the matched value instead of the regex pattern in detection history items
- **Fix author capitalization** - Default author now displays as "Scrapfly" (capitalized) in detection details
- **Fix JS API logToConsole toggle** - Removed separate toggle, console logging now automatically follows JS API enabled state

---

## v2.4

### Centralized Logging System

- **Add Logger infrastructure** - 14 categorized log types, 4 log levels, context-aware routing
  - Categories: DETECTION, CACHE, HOOKS, NETWORK, STORAGE, DETECTOR, POPUP, CONTENT, BACKGROUND, ERROR, PERF, UI, TAB, BADGE
  - All logs routed to Service Worker console for unified debugging
  - Automatic debug mode gating for performance
- **Phase 1**: Integrate Logger in background.js Service Worker
- **Phase 2a**: Migrate console.* in content.js, remove DEBUG_MODE
- **Phase 2b**: Batch migrate 206 console.* calls in detection-engine-manager.js
- **Phase 3**: Migrate console.* in all advanced capture modules
- **Phase 4**: Integrate Logger in content-main-world.js (MAIN world)
- **Phase 5**: Integrate Logger in popup.html context
- **Phase 6**: Migrate remaining console calls in manager classes (confidence, pagination, storage, color, notification)

### Payload Detection

- **URL/method constraints** - Payload patterns now support `urlPattern`, `urlRegex`, `urlCaseSensitive`, and `methods` fields
- **Enhanced HTTP method badges** - Modern design for method display
- **Akamai SBSD patterns** - Body payload and `_sec` endpoint detection
- **Akamai pixel challenge** - New payload detection pattern
- **Fix two critical payload detection bugs** - Pattern matching and URL constraint evaluation

### Advanced Capture - Cloudflare

- Replace network interception with page load listeners for more reliable capture
- Proactively extract Turnstile sitekey from DOM on detection
- Add `cf_clearance` cookie check to capture flow
- Add `_cfuvid` cookie and page reload to Check Version tool
- Simplified capture flow with context-aware notifications

### Advanced Capture - FunCaptcha

- Add advanced capture functionality with interceptor
- Rebuild interceptor with enhanced error handling and robust type checking
- Standardize capture detail modal design

### Advanced Capture - reCAPTCHA

- Redesign Callbacks modal with improved UX and click-to-copy
- Implement click-to-copy for Selector Detection modal
- Card-based layout redesign for capture details
- Full copy-to-clipboard support in capture details modal

### Advanced Capture - Akamai

- Fix Start Capturing and Extract Sensor Information flows
- Fix X close button positioning in modal dialogs
- Add popup notification for Extract Sensor Information

### Advanced Capture - All Modules

- Replace native `confirm()` with custom warning confirmation modal
- Remove all Close buttons, keep X only for consistency
- Standardize modal buttons to match History design
- Enable click-to-copy for method badges in Hidden Detections modal
- Auto-delete expired capture data after 30 minutes

### New Detectors

- **QCloud Captcha** - New CAPTCHA detector
- **ThreatMetrix** - New antibot vendor detector
- **Meetrics** - New antibot vendor detector
- **Ocule** - New antibot vendor detector
- **Cheq** - New antibot vendor detector

### Settings and Configuration

- **Complete Settings overhaul** - Persist ALL settings properly with nested setting support
- **Cache scope default** - Changed from `path` to `domain`
- **Window detection timeout** - Increased from 2s to 5s, then to 10s for better coverage
- **Extension disabled badge** - Show orange X badge immediately on page load when disabled
- **Cached badge restoration** - Show cached detection badges when extension is re-enabled
- **Window Properties Helper** - 3-step flow with condition selection

### Cache and Performance

- **Fix cache flag race condition** - Prevent unnecessary network capture on F5 refresh
- **Fix cache behavior** - Prevent unnecessary network capture on page refresh
- **Fix synchronous cache check** - Prevent unnecessary hook installation on cached pages
- **Optimize detection methods analysis** - Cache for better performance

### Detection Improvements

- **Cookie detection enhancement** - chrome.cookies API for HttpOnly cookie access
- **BotGuard detector improved** - Catch all cookie variations
- **Window properties cache-aware** - Polling respects cache hits
- **Cache hit communication** - Properly flag MAIN world to stop hook reporting
- **Respect disabled state** - Skip detection when extension is disabled

### Pagination Changes

- **Detection tab** - Increased from 2 to 10 items per page with page number display
- **History tab** - Increased from 3 to 20 items per page

### Notification Redesign

- **Scrapfly branding** - Blue notifications with Scrapfly logo
- CSS-based bullet point icon (replaced SVG attempts)

### Bug Fixes

- **Fix badge/popup desync** - Popup now correctly shows detection results when badge displays count
- **Fix "Extension context invalidated" errors** - Logger gracefully handles extension reload
- **Fix memory leaks** - Clean up `finalizationDebounce` and `batchProcessingFlags` Maps on tab close
- **Fix race condition** - Properly await `processDetectionData()` in DETECTION_DATA handler
- **Fix JS hooks not working after enabling** - Send `RELOAD_DETECTORS` message after toggle
- **Fix CSP inline event handler violations** - Replace 18 inline handlers with addEventListener
- **Fix inconsistent JS hook detection counts** - Increase MAX_DETECTION_MS from 3s to 8s
- **Fix cache hit race condition** - Check sessionStorage on every `reportHookDetection()` call
- **Fix sessionStorage persistence** - Save after DETECTION_DATA response, not just on cache hit
- **Fix JS hooks breaking page loads** - Comprehensive error handling for hook installation
- **Fix 'Could not serialize message'** - Extract lazy getters from pageData before sending
- **Fix 'Illegal invocation' errors** - Natural `this` binding in JS hooks
- **Fix 'cookiesToMatch is not defined'** - Scoping error in runDetector method
- **Fix Logger initialization errors** - Context checks and cleanup message handlers
- **Fix duplicate event listeners** - Prevent duplicate listeners in History clear modal

### Documentation

- **Updated README** with new screenshots, hero banner, and architecture diagrams
- **Added assets folder** with Chrome Web Store promotional images

### Code Cleanup

- Remove ~200 lines of dead code (`createPaginationHTML`, `getCategoryIcon`, `updateBadgeColor`, `stringifyJSON`, unused `DOMCache`)
- Replace duplicate utility functions in advanced-utils.js with delegations to Utils.js
- Add `destroy()` cleanup method to ImpervaAdvanced module
- Remove verbose debug logging from detection engine
- Remove auto-delete of `scrapfly_advanced_selected` storage persistence

---

## v2.3

### Removed

- Remove update-manager.js auto-update module (simplify extension)
- Remove `alarms` permission (no longer needed)
- Remove `setupUpdateAlarm()` from background.js

---

## v2.2

### Fingerprint Detection

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

---

## v2.1

### Changes

- Version bump from 1.9 to 2.1
- Fingerprint detectors disabled by default
- sessionStorage cleanup for cleaner state management
- Updated changelog and documentation

---

## v2.0

### Changes

- Major release with improved build and release workflow
- GitHub Actions workflow for automated builds and Chrome Web Store publishing
- Updated changelog format

---

## v1.7

### Changes

- Version bump to 1.7
- GitHub Actions CI/CD pipeline setup and refinements
- Manifest configuration updates

---

## v1.0 - v1.2

### Foundation

- Initial extension release with Manifest V3
- Core detection engine with 4-phase detection system
- JS API hook installation at document_start (18 inline hooks)
- Multi-world architecture (MAIN + ISOLATED content scripts)
- Detection rule system with JSON-based detector definitions
- Categories: Anti-Bot, CAPTCHA, Fingerprinting
- Detection methods: cookie, header, url, content, dom, window, js_hooks
- Advanced capture modules for reCAPTCHA, Akamai, Imperva, Shape Security, AWS WAF, hCaptcha, DataDome, Cloudflare
- PatternCache with LRU eviction for 60-80% regex performance improvement
- 12-hour detection cache per URL
- Tabbed popup UI with Detection, History, Rules, Settings, and Advanced sections
- Linux compatibility fixes
- Enhanced diagnostics for "No detectors loaded" error
- Detector ID preservation in storage compression
