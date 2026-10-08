# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/es-ES/0.3.0/).
Each line says what changed for the user. Technical detail lives in the commit history.

## [Unreleased]

## [2.8.3] - 2026-10-08

### Added

- Rules: each card's "⋯" menu can export just that detector, or import detectors from a file without replacing yours.

### Changed

- Scrape with Scrapfly: choose output format, proxies, country and JavaScript rendering; the code updates as you pick, with colours and copyable key and run commands.

## [2.8.2] - 2026-10-07

### Added

- Settings → Detection → Share uploads: choose where "Upload detections" sends the summary (dpaste.com, dpaste.org, paste.rs, Pastebin, GitHub Gist or your own server) and when it is deleted.
- Advanced → Cloudflare Turnstile: "Extract Site Key" shows every Turnstile site key on the page and the page it is on.
- Scrape with Scrapfly (Detection button, and a card in every protection's Advanced tools): ready-to-copy code in Python, Node.js, cURL, CLI, Go or Rust that fetches the page with Scrapfly's Unblocker.
- Advanced → History also keeps what each tool button found (cookies, scripts, site keys, versions, selectors), named after the tool, for 30 minutes.

### Changed

- Difficulty ratings revised: reCAPTCHA and AliExpress are now Medium, Ocule and Canvas fingerprinting High, and 19 other CAPTCHAs and anti-bot systems Low.
- PerimeterX (HUMAN) is also recognised when served from hsprotect.net, as on Microsoft account sign-up.
- Detection: "Copy overview" copies the same summary that "Upload detections" shares.
- Settings → General → Tag colors: the tag names are written like the categories (Dom, Headers, Cookies) and follow the chosen language.
- Rules editor: combinations open collapsed instead of the first one always expanded; pattern settings and delete buttons use quiet outline icons, and the RX / WW / CS badges explain themselves on hover.
- Advanced: only protections detected above 50% confidence get tools, so a page that merely mentions a vendor no longer lists it; change the limit in Settings → Detection → Advanced tools.
- Advanced → Check cookies (every vendor): one clear view with each cookie's full value, domain, path, expiry and flags, plus the expected cookies that were missing; history entries reopen it.
- Dropdowns open as a dark list in the extension style instead of the system list; scope choices (cache, duplicates, URL, request/response) show an icon.
- Delete buttons across the popup (patterns, combinations, blacklist, webhook headers, history, logs) use the same outline trash that turns red on hover.
- Confirmations, Settings and the rule editor share one button style with a quiet outlined Cancel; clearing Advanced captures now asks in the same dialog.
- Settings → JS API: the usage example is a code panel with a copy button that no longer covers the code, and every line fits.
- Rules: the "Only check scripts" help now says what it does: it searches JavaScript code only, not page text or file names.

### Removed

- Advanced → Cloudflare Turnstile: removed "Check cookies" (Turnstile sets none); "Analyze scripts" no longer deletes the Cloudflare cookie.
- Advanced → Cloudflare: removed the "Check Version" action.

### Fixed

- Fingerprint detection now catches what pages do in their first moments and inside hidden iframes; on CreepJS, Canvas, Font and WebGL score much higher.
- Pages where only fingerprinting was found no longer show an empty result.
- History no longer shows an image the page merely preloads as the site's icon, and a site icon that fails to load on the Detection tab shows the logo.
- Detector updates now bring new difficulty ratings, both from Rules → Update and when the extension updates; a difficulty you set yourself in the editor is kept.
- Settings → Detection: with cache scope "Path" or "Full URL", other pages of the same site are now scanned instead of showing the first page's result.
- Detection: "Upload detections" and "Copy overview" now give the address of the page you are on, not the first page scanned on that site.
- The Scrapfly logo is sharp again on high-resolution screens (popup header, empty states, Advanced, History, Stats, and in place of a missing site icon).
- Advanced → Cloudflare: "Extract Site Key" no longer picks up reCAPTCHA or hCaptcha keys and finds keys of widgets rendered from script.
- Advanced → History: the module filter lists every vendor with saved entries (Imperva and AWS WAF filtering works again), and a new Tool filter shows only captures or one kind of tool result (cookies, site keys, selectors…).
- Settings → General → Detector updates: "Check now" no longer breaks onto two lines, and "Update Extension" opens the extension's real store page.
- Rules → Restore official detectors asks before running, keeps going when one detector cannot be restored, and says why if it fails.
- Rules → URL help: the warning said patterns match case by default; they ignore case unless "Case sensitive" is on.
- Rules: a regex with "Case sensitive" off no longer changes meaning when it uses \D, \S, \W or \B.

## [2.8.1] - 2026-10-06

### Added

- Seven CAPTCHA detectors: NetEase Yidun, Aliyun, Yandex SmartCaptcha, Dingxiang, Capy, Shumei and MTCaptcha, each with its official vendor logo.
- Nine anti-bot detectors: Anubis, Alibaba Cloud WAF, Jiasule, Ruishu, FingerprintJS, Netacea, Azure Front Door, Yundun and Radware, each with its official vendor logo.
- FingerprintJS also recognises sites that bundle the library themselves or report to Fingerprint's API, as fingerprint.com does.
- Rules → Choose Icon: a search box filters the icons as you type.
- Settings → Detection → Category order: choose which categories the Detection list shows first (for example captchas before anti-bots).

### Changed

- Detection: the results list shows two detections per page, with cards as wide as the summary above them.
- Rules you edited are no longer overwritten by updates: Update asks per rule (keep your edits or use the new version), and edited rules are marked with a reset option.
- Automatic updates now install new detector versions themselves, and turning them on or changing the interval takes effect immediately.

### Fixed

- Rules based on response headers, request headers or Set-Cookie never matched on real pages (for example Cloudflare's server header or Sucuri's headers); they now work.
- On busy pages, scripts loaded early (where most protection SDKs load) could be dropped before detection ran, so their URL rules missed.
- Only the first payload rule of a detector could match a request (Akamai has three); every payload rule now counts.
- Saving a rule in the editor dropped options it does not show (rule descriptions, hook options) and broke selectors containing quotes.
- Detector updates now take effect right away instead of after a browser restart, and editing a rule just after updating no longer undoes the update.
- Updating the extension now delivers its new and improved detectors to existing installs, not only to new ones.
- A failed update check is reported as an error instead of "All detectors are up to date".
- DataDome's response header could be reported as a Shape Security detection on installations upgraded from very old versions.
- The Settings webhook test now sends detections in exactly the format of real triggered events, so it reliably validates integrations.

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

[Unreleased]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.3...HEAD
[2.8.3]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.2...v2.8.3
[2.8.2]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.1...v2.8.2
[2.8.1]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8...v2.8.1
[2.8]: https://github.com/scrapfly/Antibot-Detector/compare/v2.7...v2.8
[2.7]: https://github.com/scrapfly/Antibot-Detector/compare/v2.6...v2.7
[2.6]: https://github.com/scrapfly/Antibot-Detector/compare/v2.5...v2.6
