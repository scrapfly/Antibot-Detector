/**
 * WorkerMessages — the one place the extension's own message types are written down: what the popup, the stats page
 * and the ISOLATED content script send to the service worker, and what the worker sends back to them.
 *
 * Three families live elsewhere on purpose, each already named once:
 *   ScrapflyBridgeProtocol.MESSAGE_TYPES   the page bridge (MAIN world ↔ ISOLATED ↔ worker): modules/core/bridge-protocol.js
 *   AdvancedMessageTypes                   the Advanced tools' capture jobs: modules/core/message-types.js
 *   HistoryStore / HistoryBackup / HistoryWatch .Messages   History's own operations, owned by those modules
 *
 * A handler is registered as registry[WorkerMessages.X] and a message is sent as { type: WorkerMessages.X }: never
 * as a string literal (test/worker-messages.test.js fails on one). Each value equals its key, so a message read in a
 * log or a test still reads as its name.
 *
 * Loads before its users in every context: the worker (background.js), the popup (popup.html) and the content
 * script (manifest.json). Never in the MAIN world. No dependencies.
 */
(function(root) {
  'use strict';

  const NAMES = [
    // Detection: the content script and the worker
    'PAGE_LOAD_NOTIFICATION',   // a page loaded: cache lookup, or a scan begins
    'DETECTION_DATA',           // the content script's collected page data
    'CONTENT_SCRIPT_READY',     // the content script announces itself
    'GET_DETECTORS',            // the content script asks for the detector definitions
    'CHECK_CACHE_EARLY',        // the content script asks whether a cached result exists before collecting
    'CACHE_HIT_EARLY_EXIT',     // the content script stopped early because of a cached result
    'REQUEST_DETECTION',        // the popup (or the worker's own tab events) asks for a scan of a tab
    'GET_DETECTION_DATA',       // the popup asks for a tab's result
    // The worker to the content script (the page's JS API events, and a requested scan)
    'REQUEST_PAGE_DATA',
    'RUN_DETECTION',
    'GET_DETECTION_STATUS',
    'DETECTION_COMPLETE',
    'DETECTION_PROGRESS',
    'DETECTION_ERROR',
    // The worker to the popup
    'NEW_DETECTION_DATA',
    // Caches
    'DETECTION_CLEAR_CACHE',    // one tab's result (Detection tab)
    'HISTORY_CLEAR_CACHE',      // one page's result (History tab)
    'DETECTION_CLEAR_ALL_CACHE', // every saved result (Settings → Data → Storage)
    // Settings and rules
    'SETTINGS_UPDATED',
    'EXTENSION_TOGGLE_CHANGED',
    'SYNC_CATEGORY_COLORS',
    'CACHE_SCOPE_CHANGED',
    'RELOAD_DETECTORS',
    // The webhook's record of recent deliveries
    'WEBHOOK_LOG_ENTRY',
    'WEBHOOK_LOG_CLEAR',
    'RULE_TEST',                // Rules editor → Test on this page: run the unsaved rule against the active tab ({ detector, tabId })
    'RULE_TEST_COLLECT',        // worker → content script: hand back the page as a scan would collect it, without scanning it
    'RULE_SUGGEST_PAGE',        // Rules → From this page: the active tab's cookies, loaded scripts and response headers ({ tabId })
    'WEBHOOK_RETRY',            // Recent deliveries → Retry: send a failed delivery again now ({ id })
    'COOKIE_TIMELINE_GET',      // Advanced → Check Cookies: the protection cookie timeline of a page's site ({ url })
    // Bulk scan (sections/bulk/): the run lives in the worker, the page starts and steers it (extension pages only)
    'BULK_SCAN_START',          // { entries, timeoutSec, cap, continueRun? }: a new run of these addresses (continueRun: the stopped run goes on)
    'BULK_SCAN_PAUSE',          // finish the page being scanned, then wait
    'BULK_SCAN_RESUME',
    'BULK_SCAN_STOP',           // close the scan tab now; the pages not scanned stay waiting
    'BULK_SCAN_STATE',          // the run as it is now (also in chrome.storage.session)
    'BULK_SCAN_CLEAR',          // forget a finished or stopped run
    // Logging and the log collector
    'LOG',
    'LOG_COLLECTOR_ENABLE',
    'LOG_COLLECTOR_DISABLE',
    'LOG_COLLECTOR_CLEAR',
    'LOG_COLLECTOR_EXPORT_JSON',
    'LOG_COLLECTOR_EXPORT_TEXT',
    'LOG_COLLECTOR_GET_COUNT',
    'LOG_COLLECTOR_SET_MAX_LOGS'
  ];

  const WorkerMessages = Object.freeze(Object.fromEntries(NAMES.map(name => [name, name])));

  root.WorkerMessages = WorkerMessages;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.WorkerMessages = WorkerMessages;
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkerMessages;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
