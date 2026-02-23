# activeTab

Used when the user interacts with the extension popup to operate on the currently active tab and request tab-scoped detection/capture actions.

# alarms

Used to schedule periodic detector update checks when the user enables auto-update settings.

# cookies

Used to read site cookies (including HttpOnly via `chrome.cookies`) for anti-bot/captcha detection; some advanced troubleshooting actions can clear cookies when user-triggered.

# downloads

Used only for user-requested exports (debug logs/capture data) to local files.

# host permission use

Required to run detection across whatever site the user visits, including content-script analysis and request/response signal correlation.

# notifications

Used as a fallback system notification channel for extension status/errors when in-page notification display is unavailable.

# remote code use

The extension fetches remote detector definition **JSON data** only; it does not fetch/execute remote JavaScript/WASM, and does not use `eval`/`new Function` for remote execution.

# scripting

Used for tab-scoped script execution needed by advanced capture flows and in-page status helpers.

# storage

Used to persist extension settings, detector data, cache/history, and runtime state in `chrome.storage.local`.

# tabs

Used to query the active tab, react to tab lifecycle changes, message the correct tab, and maintain per-tab badge/status state.

# webNavigation

Used to follow navigation lifecycle events for challenge/captcha interception workflows and state cleanup.

# webRequest

Used to inspect request/response metadata (headers, request bodies, and URL patterns) required by detection logic.

# single purpose description

Scrapfly Anti-bot Detector’s single purpose is to detect and analyze CAPTCHA, anti-bot, and browser fingerprinting technologies on websites the user visits, then show those results in the extension UI, with optional user-initiated exports and integrations.

