# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/es-ES/0.3.0/).
Each line says what changed for the user. Technical detail lives in the commit history.

## [Unreleased]

## [2.8] - 2026-10-05

### Added

- History statistics (Settings → Data): five sections, varied paginated charts, searchable domain details, and private CSV and JSON exports.
- Optional auto-delete of History entries older than N days (off by default, 30 days).
- Cache duration in months and years. Stored values outside the new ranges are converted on load.
- Combinations: build rules in the popup with readable patterns, All / Any / At least choices, clear count arrows, and optional combined matches.
- Webhook bodies follow the chosen Content-Type: JSON, form, multipart, text, XML, CSV, NDJSON or custom. "Test" sends exactly what the extension sends.
- Webhook payload help: every variable with an example value, insert chips and live JSON validation.
- Official detectors can be deleted. Update keeps them deleted and "Restore official detectors" brings them back.
- Merge / Replace / Cancel choice when importing History or Rules.
- In-popup colour picker instead of Chrome's white OS dialog.
- Shared, translated hover tooltips throughout the popup and Statistics page, including Detection metrics and wrapped long detection values.
- IBM Plex fonts for Arabic, Hindi, Japanese, Korean and Chinese, so those languages no longer fall back to system fonts.
- Cloudflare Turnstile detector in CAPTCHA, which also finds Turnstile widgets on sites not behind Cloudflare.
- Metric tiles explain their numbers on hover: detections per category, the scores behind each average, what set the difficulty, matched values per method, and cache dates. In History, Detection, Rules and Statistics.

### Changed

- New 2.8 look across every tab: header, segmented tab strip, flat tiles, one close button, one confirmation dialog and flat toasts.
- Detection: compact search and shared scrolling with pagination pinned flush to the bottom. Results retain colour-coded metrics, confidence dials and difficulty labels.
- History: two-row cards at about half the old height, and a redesigned detail modal with metric tiles and a category bar.
- Rules: clearer edit buttons, compact menus, a redesigned rule editor, collapsible combination cards and a one-screen plain-language window-property helper.
- Advanced: readable action rows, reload/reset hints, consistent code dialogs, direct protection cards and centered branded empty screens. "Start capture" is always the last row, and the tab uses the same blue as the others. Starting a capture closes the popup.
- Settings: four sub-tabs with grouped cards, a segmented webhook method picker and collapsible JS API sections.
- Confidence colours match throughout: 0–50% green, 51–79% orange, 80–100% red. Difficulty: Low green, Medium orange, High red.
- Detection: larger state cards, centered paused icons, text-only domain fields and roomier actions. On excluded domains the toolbar icon dims and shows a pause tile instead of "BLK".
- Chips read "Url", "Dom", "Captcha" instead of all caps.
- History limit 0 now keeps the newest 1,000 entries instead of unlimited.
- Changing the UI language rebuilds the popup in place, on the same tab.
- All remaining English text is translated in the 12 languages, including in-page notices.
- The detection cache is pruned and capped at the 500 newest entries.
- Every extension context now shares one message protocol and one JS-hook timing config. Detection results are unchanged.
- Debug mode prints one readable report per scanned page (detections, evidence, timing) instead of about 190 lines. Settings → Verbose logs adds step-by-step detail.

### Removed

- Verified checkmarks next to the author.
- Unreachable UI, unused messages and dead code, including 120 CSS rules that could never apply and unused translation keys.

### Fixed

- Detection results recover correctly after unblocking a domain or refreshing the page.
- Detection tab could open blank instead of showing the "Scanning this page" card while a scan was running.
- Detection pagination now stays at the bottom of the popup, even on a short last page.
- The toolbar loading spinner often turned grey or showed a dark smudge mid-scan. It now stays white on blue for the whole scan.
- In-page capture notices are cleaner, without the status pill and the coloured top bar.
- Pages such as Gmail no longer fill the extension's Errors page with "Deprecated API for given entry type." warnings.
- Every website's own console showed about 11 "[Scrapfly JS API]" groups per page load. They now appear only in Debug mode.
- Detection hides stale results when disabled or blacklisted; searches with no matches keep pagination visible with a zero count.
- Advanced: saved captures open across vendors, pending actions resist repeated clicks, and recording controls retain confirmed state. Empty views and filters recover correctly.
- Editing a combination preserves its nested groups and minimum match count.
- Fingerprint: graded combinations for every detector and low-confidence standalone references. Script checks exclude non-JavaScript content, and failed API calls no longer count.
- CAPTCHA: graded combinations and weaker standalone references, with vendor-specific URLs and exact widget matching to reduce false positives. Invisible reCAPTCHA, legacy hCaptcha, Tencent's international host and Arkose's challenge frame are now recognised.
- Anti-bot: all 16 detectors rebuilt from live sites. Generic paths such as /verify or ips.js and CDN headers no longer score 85–100 on ordinary pages. Top scores need two vendor signals. Google BotGuard now detects, and AWS WAF, Kasada, CHEQ, Shape, F5 and Reblaze match their current integrations. Ocule and Meetrics, whose services are gone, are capped at 60.
- Rules like `[data-sitekey]` never matched the standard reCAPTCHA, hCaptcha and Turnstile `<div>` widgets.
- History entries could disappear after a delete, import or clear. The service worker is now the only writer.
- After a few hundred History entries, storage filled up and new pages stopped being cached or saved ("quota exceeded" errors). History is stored about four times smaller and never fills it again.
- "Clear cache" could report success while another save put the entry back.
- Closing the import dialog replaced the stored data. It now cancels.
- Rules toolbar Clear, Import and Export threw errors.
- Settings JSON export and import did not work.
- Saved badge colours never reached the toolbar badge.
- The release zip shipped without the fonts.
- A raised JS-hook timeout override was still cut off at 8 seconds.
- Detection methods showed a lower % than the combination they triggered.
- An empty "Matched combinations" heading showed for detectors without combinations.
- Detector author showed "—" in the detection modal.
- Cache expiry showed "-" and the scope "Path" right after a live detection.
- History cards used the URL captured at first detection instead of the page title.
- The Rules search was lost after a delete or restore.
- The "More about advanced tools" link did nothing.
- Typing in a combination card made the page jump.
- Copying a History match replaced the whole row with "✓ Copied!".
- Small alignment issues in the rule editor and Method Settings.

## [2.7] - 2026-06-14

### Added

- Upload detections to an unlisted dpaste.com link. Asks first, and never includes cookie or header values or the query string.
- Copy detection as JSON.
- Language picker in Settings and full UI translation in 12 languages.
- Separate Category and Tag colour cards in Settings.
- Accessibility: labels on icon buttons, announced state changes, reduced motion support and visible keyboard focus.

### Changed

- Official detector logos redrawn as uniform, crisp white tiles.
- Method badges always read in English (URL, HEADER, COOKIE…).
- Rules and History toolbar buttons are text only.

### Removed

- Pages can no longer read the extension's detector files (`web_accessible_resources` removed).
- Dead code: unused modules, the country-flag lookup, never-read pattern precompilation, about 140 unused translation keys and orphaned message flows.

### Fixed

- JS hooks broke strict single-page apps like claude.ai, leaving a blank page.
- Console flood of "Identifier has already been declared" errors. Tabs left open after reloading the extension now ask for a page reload.
- Toolbar badge count disagreed with what the popup showed.
- Popup showed "No detections found" or a blank panel while a scan was still running.
- "Deprecated API for given entry type" warnings on Gmail and other sites.
- Adding or removing a blacklisted domain could wipe all settings.
- Errors were hidden unless debug mode was on.
- The close button was covered by header text in long or right-to-left languages.
- Untranslated text across Detection, Advanced and Settings.
- DataDome PHP export and the Imperva success message threw errors.
- Two detections saved at once could overwrite each other in History.
- Confidence could show above 100%.

### Security

- Cookie and header values are no longer stored in the detection cache.
- Webhooks require HTTPS and refuse private and local addresses. Webhook URLs are redacted in logs.
- Stricter extension Content Security Policy.
- Detector regexes that could freeze the extension are rejected, including URL patterns.
- Page titles, URLs and rule values are escaped everywhere they are shown.
- The page message listener only accepts messages from its own window.

## [2.6] - 2026-02-23

### Added

- Toolbar badge restored when switching tabs.
- Pagination and search inside each method in the rule editor, plus a read-only Version field.
- Loading spinner shown immediately when the popup opens.

### Changed

- Timing values and limits gathered in one constants file.
- Favicons come from the tab instead of a network request.
- Fewer false warnings and errors in the logs.

### Removed

- 31 unused methods, dead CSS and empty stub files.
- Session storage keys that pages could use to fingerprint the extension.

### Fixed

- Badge stuck on "OFF" or the loading icon, or not updated when opening the popup.
- Shape Security and AWS WAF captures not cleaned up when a tab closed.
- Duplicate prevention settings were ignored.
- Rules could be saved with empty required fields.
- Settings failed to load on start.
- Incomplete HTML escaping in Advanced capture details.
- Repeated favicon 404 errors in the console.

[Unreleased]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8...HEAD
[2.8]: https://github.com/scrapfly/Antibot-Detector/compare/v2.7...v2.8
[2.7]: https://github.com/scrapfly/Antibot-Detector/compare/v2.6...v2.7
[2.6]: https://github.com/scrapfly/Antibot-Detector/compare/v2.5...v2.6
