# Changelog

All notable changes to the Scrapfly Antibot Detector extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/es-ES/0.3.0/).
Each line says what changed for the user. Technical detail lives in the commit history.

## [3.0.9] - 2026-10-30

### Added

- Detection → Copy: Node.js (fetch), a script that requests the page again with this browser's headers and cookies, naming the protection cookies; redirects are not followed, so the cookies stay on the page's host.
- Bulk scan: Scan the failed pages again, for a finished or stopped run with pages that timed out or failed to load; the rest of the run stays in the table and the exports.

### Changed

- Settings → Data: History statistics is open when Settings opens, so Open statistics is one click away; Storage and Backup stay folded.
- Detection and History details: each detection method (Matched detections in History) shows its type and score, and its value opens when you click the row.

### Fixed

- Anubis and PerimeterX (_pxhd) cookies are recognised again: their value rules needed more than the 100 characters the extension reads of a cookie.
- Detection: a cookie rule that checks a value now looks at every cookie of that name, not only the first one.
- Detection: a site on another port (localhost:3000 and localhost:8080) no longer shares a cached result with the first one.
- Detection: a cached "match or not" answer can no longer be served to a different text or pattern.
- Clear cache removes every result a reload could be served from (the www and bare-host entries, the page and site entries), so a cleared page is scanned again.
- Rules: a pattern with three or more wildcards in a row (a*a*a*b) is refused, as it could freeze scanning.
- Statistics: the change since the previous period is right for HUMAN (PerimeterX); the Domains search and "Show the domains with X" cover every protection of a domain, not the first eight.
- Advanced: no tools are offered for detections the Detection tab dropped (Clear cache, a blocked site, the extension off); Current site is empty on a page without a host.
- Copy buttons: a second click during "Copied!" no longer leaves the button on "Copied!".
- Rules → Update: a bundled update the installed rule has caught up with no longer keeps the badge.
- Scrapfly code: curl sends a value with a + (a CSS selector such as .price+.currency) encoded, so the API does not read it as a space.
- Rules editor: a custom category stays in its list and is never saved empty; stray spaces are trimmed from names and values; a new pattern never reuses a saved id.
- Rules editor: a flag written as text in a rule file no longer counts as on; Rules search finds a rule by category; history check and live test work after a rename.
- Rules: importing says which official rules were kept because the file's copy differs; a rule icon that is not an image, or is too large to store, is refused.
- Settings: a browser in Hebrew, Persian or Urdu, languages without a translation, no longer gets the English text mirrored right to left; relative times read right in every language.
- Settings: Save checks a share address only when you changed it; a cache time saved by an older version loads again; an unknown dropdown value is refused with a message.
- JS hooks: a page's own wrapper over a watched function is kept when the extension steps aside; a rescan on a page whose load never finishes now completes.
- Sites left out of scanning get no JS hooks or window checks at all, so the page runs untouched.

### Security

- Copy → Python (requests): the cookies go to the page's own host only, not to a host the page redirects to, and non-ASCII values arrive intact.
- Copy and share: a path parameter (;jsessionid=…) and an email address in the page's address are left out.
- Advanced → hCaptcha: the extension asks for a configuration address the page names only when it is https on a public host name.
- Changing settings, clearing the cache and the vendor capture tools answer the extension's own pages only, never a web page's context.
- Scrapfly code: a detector name with a Unicode line separator can no longer end a comment and run as code in a Node.js snippet.
- Rules import: a flag in an imported rule file can no longer break out of the editor's markup.
- The extension's helper objects and function marker are no longer visible to the page, so a site cannot detect the extension from them.

## [3.0.8] - 2026-10-29

### Changed

- Advanced captures are stored once instead of twice, so they take about half the room shown in Settings → Data.
- Yundun Cloud WAF is now recognised on its captcha page too, the one shown instead of the site (csdn.net answers some visitors with it).

### Fixed

- Private windows: a page scanned in a private window is no longer shown (badge, popup) for the same page in a normal window.
- Private windows: Advanced captures (Akamai, reCAPTCHA, FunCaptcha…) are listed in Advanced → History again and counted in Settings → Data, kept in memory until the browser closes and never saved to disk.
- History → Changed: a change confirmed by another scan or a watch check, or days old, is no longer taken for a blip and lost; a removal stays marked after clean scans.
- History → Changed: a clean scan that undoes the mark right after it now clears it, like any other scan.
- History: two pages of one site are no longer a change; Alert for pinned pages keeps working after a second visit; pinned entries past the History limit are listed again.
- Rules: translating an official rule no longer marks it Edited when the rule spells out a default setting (45 of the 85 rules did).
- Rules: Save refuses an invalid regex in a payload pattern's URL pattern.
- Settings → Restore: rules of a backup that this version cannot take are named instead of dropped without a word.
- Settings: a webhook address saved by an older version no longer blocks an unrelated Save, an import or a restore.
- Bulk scan: quoted cells with commas or line breaks (as spreadsheets and its own CSV export write them) and several addresses on one line are read right; commas inside an address (a Wikipedia title, ?ids=1,2,3) are kept.
- Bulk scan: a page an address redirects to is always scanned in full, even when a result for it is cached.
- Bulk scan: Scan the pages still waiting keeps the pages already finished in the table and the exports, instead of starting a new list.
- Watchlist: a check that lands on a skipped site is reported as skipped at once, not as failed after 45 seconds.
- Detection: a page you stay on after a download, a cancelled load or Back keeps its requests as evidence, and so does a prerendered page just shown.
- Detection: protections found after a scan by late responses and by late requests at the same time no longer overwrite each other (CHEQ's proof upgrade could be lost).
- Webhook: a page title with a dash or non-Latin letters in a header no longer fails every delivery; a retry claimed by a worker that then stops is no longer lost.
- Advanced: reCAPTCHA's 60-second auto-stop, or a Stop pressed while it saves, no longer saves the captured requests twice.

### Security

- Webhook CSV: a page title that starts with = + - or @ stays text when the file is opened in a spreadsheet.
- Rules: an imported rule file can no longer change objects the extension relies on through the text of a rule.

## [3.0.7] - 2026-10-27

### Changed

- Russian: the Advanced tab is now called «Дополнительно».
- Rules editor: the description boxes are taller and grow as you type.

### Removed

- Rules editor: the Translate button, the per-language fields and the Original panel are gone. A description or name is one box in your language, and what you type replaces it for every language. Scrapfly's rules stay translated.

### Fixed

- Rules translated in 3.0.6 no longer show as edited, so updates install without asking; updates and Reset to official keep their translations.
- Rules: texts downloaded with an older release no longer override the newer translations an update brings.
- History → Changed: no more marks from a cached result, a weak score or a protection missing for one visit; a page that lost its protections is now marked (History's own settings still apply).
- History: a Changed mark stays until the next change, the watchlist and Statistics ignore cached results, and pages that keep failing no longer block the other watched ones.
- History: a damaged entry or a hand-edited import file no longer breaks the list, exports or backups, and an imported file never adds pages to the watchlist.
- Private windows: scanned pages are forgotten when the last private window closes (or at the next start) instead of staying for days.
- Private windows: a private page's result is never shown, recorded or sent for a normal window, even when evidence arrives after the scan.
- Private windows: Check Cookies no longer shows the cookie timeline of your regular windows, and Advanced tool results (cookie values, captures) are shown but no longer saved to Advanced → History.
- Check Cookies: a cookie with the same name on two domains of a site gets its own timeline on each, so one expiring no longer ends the other.
- Detection: requests sent while you leave a page, or by the page before a preloaded one, no longer count as evidence for the next page.
- Detection: a rescan no longer cuts its JS hooks short.
- Settings: changing the language asks about unsaved changes, and presets, imports and restores start from your saved settings.
- Settings: Save refuses a webhook address that cannot receive deliveries, imported colours are checked, and site names with accents (bücher.de) are kept in the site lists.
- Advanced: reCAPTCHA and Akamai captures keep going when a page only changes what comes after ? or #, and the reCAPTCHA auto-stop keeps its results.
- Advanced: expired captures are removed on time, FunCaptcha no longer saves a capture twice, and a finished capture stops watching pages.
- Rules: stray text in an imported rule file can no longer wipe your custom rules at the next start, and a file cannot pass off a fake rule as an official one.
- Rules: Merge imports the valid rules of a file and tells you which ones it skipped.
- Rules: Save refuses a pattern that is invalid or could freeze scanning, and Check against History reads header names as detection does and can no longer freeze the popup.
- Rules editor: From this page on a row that already has a pattern now adds new rows instead of replacing it, and the hover text explains how a plain name matches.
- Page safety: a web page can no longer read the extension's internal token by wrapping browser functions, and a page function named ready() is no longer called by the JS API.
- Share uploads: tokens in a page's address path (password reset, invite and magic-link pages) are left out.
- Webhook: a failed delivery waiting for a retry is no longer lost if the browser stops the extension's background work in between.
- Watchlist and Bulk scan running together: the background scan tab is now always closed after the extension restarts.
- Detection → Copy → curl: addresses with brackets or braces (filter[brand]=…) no longer make curl fail.
- Bulk scan: addresses with commas or semicolons (?ids=1,2,3) are no longer cut off, and a page an address redirects to is scanned instead of shown from the cache.
- Bulk scan: pressing Stop and then Scan on the waiting pages no longer leaves the run stuck on Running.

## [3.0.6] - 2026-10-26

### Added

- New protections: Fastly Bot Management (anti-bot), Kount and Riskified (fraud scripts, filed under anti-bot) and Lemin Cropped Captcha.
- Advanced → Check Cookies: a timeline per protection cookie shows when it was set, how often it changed and when it expires (kept in memory only).
- Detection → Copy: curl command and Python (requests) that request the page again with this browser's headers and cookies, naming the protection cookies.
- Rules editor: each Cookies, Headers and Url pattern has a From this page button listing the open page's cookies, response headers or scripts to fill it, marking what a rule already detects.
- Bulk scan (History → ⋯ menu): scan a pasted list, a file or a sitemap of up to 200 pages in a background tab, with live results, CSV/JSON export and History recording.
- Akamai recognises its crypto challenge, Cloudflare its challenge cookies, F5 its client-side challenge cookie, and FingerprintJS now also spots BotD and its current script addresses.

### Changed

- Rules editor: the folded Combinations card says how many combinations the rule has ("4 combinations"), like the patterns card.
- Rules editor: a Translate button in the header, always there, counts the description, pattern and combination texts left to translate and fills them; it replaces the bar above the editor and the per-text Translations panels.
- Rules editor: languages the browser has not downloaded yet download one per click (the browser allows one per click), with a notice saying how many are ready.
- Rules editor in another language: texts are edited in that language only; the English original is no longer shown under them.
- Netacea scores its cookie once, so a page that sets and sends it back no longer looks more certain than it is.
- Webhook: a server that does not answer within 10 seconds counts as a failed delivery (and is retried) instead of holding up the scan; private-window pages are never sent.
- Rules: a custom pattern that could freeze scanning on long pages is refused when you save it.

### Fixed

- After a page served from the cache, the next page you open keeps its headers and cookies as evidence (Cloudflare and Akamai header rules could miss it).
- A page served from the cache no longer leaves a scan running in the background for minutes.
- Pages restored with Back or Forward, and pages Chrome loaded ahead of time, show their badge again; a preloaded page no longer wipes the captured data of the page you are on.
- Clear Cache keeps the tab's captured headers and cookies, so the next scan without a reload is as complete as before.
- Private windows: cookie rules read the private window's own cookies.
- Headers and cookies are matched to the page's exact site, not to any address that contains its name.
- Faster scans on large pages and pages that send big requests.
- History: a page title containing quotes can no longer change how its card looks; webhook header values with quotes are no longer cut short when saved again.
- Rules editor: closing it with ✕, Escape or a click outside asks before discarding any change (deleted patterns, icon, conditions, translations), not only typed text; a translation that finishes late no longer lands in the next rule.
- Rules editor: changing only an official rule's icon marks it as edited, so Rules → Update keeps your icon.
- Settings: Escape in Template variables closes only that window; an empty number field shows an error instead of saving nothing; the webhook method buttons react once per click.
- History and Detection keep the page you are on when the list refreshes, and an open detection's details stay open when late evidence arrives.
- Advanced: a tool card redrawn while its tool is reloading the page shows it is busy instead of ignoring clicks; one bad capture address no longer empties Advanced → History.
- Keyboard: History cards, pattern types, condition options and icon tiles can be reached with Tab; page arrows have names and point the right way in Arabic.
- Rules editor: Translate changes no longer wipes translations when the browser cannot translate some languages yet (the text stays as it was), and a change typed back as it was no longer counts.
- Rules editor in English: the empty second description box (left over from 3.0.5's editing in your language) no longer shows.
- "1 history item" instead of "1 history items"; Clear All leaves Select mode; Detection keeps refreshing after an error.

## [3.0.5] - 2026-10-26

### Added

- New protections: Queue-it, Vercel Firewall, DDoS-Guard and Wordfence (anti-bot), ALTCHA and Cap (CAPTCHA).
- New fraud and device-intelligence scripts, filed under anti-bot: TransUnion TruValidate (iovation), Forter, Sift, Castle and SEON. Castle bundled into a site (x.com, Atlassian) shows at a low confidence from its cookie.
- Fingerprinting: Hardware now notices pages asking for the WebGPU adapter and its details, Navigator notices permission checks, and Device Orientation notices reads of orientation and motion sensor values.

### Changed

- PerimeterX is now named HUMAN (PerimeterX); History, the watchlist, Compare, Statistics and pinning by name treat both names as one protection.
- Azure Front Door scores lower on its own: its headers show the Microsoft edge, not that its firewall is switched on.
- Detection: in a protection's details, each piece of evidence (an address, cookie or header) copies in full with a click or Enter.
- Arabic: the popup reads right to left, like the Statistics page; addresses and page titles keep their own order and are cut at their end.
- Rules editor: in another language than English, descriptions and combination names show and are edited in that language (saved as its translation); the English original and the other languages fold under "Original (English)".
- Rules editor: after you change a description or a combination name in your language, a bar at the top offers Translate the changes, which puts your new wording into English and every other language.
- Advanced: the protection's name above its tools is now a heading, no longer a box that looks like one of the tool buttons.
- Advanced → Analyze Scripts no longer closes the popup: it lists the protection's scripts the page already loaded, at once, and reloads only a page where none were found.
- Advanced → Analyze Scripts redesigned: one compact list, each script's type and its path (the host only when it is another site's), the whole row copies the address.
- Advanced → Check Cookies redesigned: a found/expected status line, then one card per cookie with its name and flags, its value as one block to copy, and domain, path and expiry as plain text.
- Advanced → History redesigned: one search row with a … menu (export, clear), a Current site / All sites switch, vendor and tool chips, and compact rows with the vendor's logo.

### Fixed

- Rules → Update no longer overwrites your own rule that uses an official rule's name, and no longer duplicates an official rule you moved to another category; both now ask first.
- Rules: importing a rule with a number where text belongs, or with markup in its logo, is refused instead of stopping scans or showing that markup on its card.
- Rules editor: a confidence of 0 stays 0 when the rule is reopened, and a payload rule listing several HTTP methods keeps them all.
- Rules: an on/off switch that could not be saved goes back and says so, and deleting a combination names it without stray "&amp;" codes.
- Detection: a page that was never scanned, whose scan failed or was cut short, or whose cache was just cleared no longer shows the green "Nothing Detected".
- Detection: clearing the cache or changing the cache scope in Settings no longer leaves the old results on the Detection tab.
- Detection: scans finish after quick navigation, reloads and address changes within a page (ChatGPT scans no longer stay pending).
- Detection: browser and extension pages say they cannot be scanned, without the clean-result badges.
- Detection: requests a page makes after its scan (CHEQ's beacons, for example) now count: the protection and its confidence update in the badge and popup. A slow page's late hook report no longer leaves a scan that never ends.
- Paused sites show only the action for the selected scan mode, and opening several popups no longer breaks Advanced tools or settings changes.
- Detection: result cards open with Enter or Space, and their details dialog keeps keyboard focus until it is closed.
- Settings: Escape in the language list closes only the list, not Settings with its unsaved changes; the list also works with the arrow keys.
- Settings: Add current domain refuses browser pages and blank tabs instead of adding names like "extensions" or "newtab".
- Settings: keyboard focus stays inside Settings (and its dialogs) until it is closed, and changing the language asks to save or discard unsaved changes first.
- Exports, backups and saved rules are named with your own date, not UTC's (an export just after midnight was named for the day before).
- Rules editor: clicking outside the editor after typing changes asks before dropping them.
- Rules: a search lists the rule with that exact name first, then names starting with it (searching "Cap" no longer buries Cap under every CAPTCHA).
- Advanced: Shape Security saves one capture once (it could save the same capture up to six times), and hCaptcha saves once and says when it timed out empty.
- Advanced: Analyze Scripts and captures are no longer cancelled when the page changes its own address, and a stopped or timed-out analysis says so.
- Advanced: Imperva and Akamai extract tools ask you to stop a running capture first instead of leaving Start Capturing stuck, and work again after Chrome restarts the extension in the background.
- Advanced: Akamai Extract Sensor reloads the page once instead of twice; GeeTest and Akamai tools wait for the page to finish loading instead of a fixed delay.
- Advanced: stopping a FunCaptcha capture that had already ended no longer shows an error, and a captured item opens once per click.
- Detection: rescanning a page, or moving within a single-page site, after a cached result checks JavaScript hooks and page globals again.
- Detection: fingerprinting checks no longer stop early on pages that use a watched browser API while still loading, so later calls are still caught.
- Detection: a site that calls a browser API on the wrong object gets the browser's normal error again instead of a quiet answer (one case could clear the site's storage).
- Detection: pages can no longer tell the extension's JavaScript hooks from the browser's own functions by reading their source text.
- Detection: pages that add and remove many frames no longer keep growing in memory, and two rules checking the same page global (a duplicated rule) are both reported.
- Rules: URL, content and JavaScript-hook rules without a confidence score the default instead of zero, cookie rules score the same in any order, and page plus hook evidence keeps the higher confidence.

## [3.0.4] - 2026-10-23

### Added

- Statistics: a protection's name in the Protections table shows the domains that have it, and a site's name in Domains or Protection changes opens that site's History in a new tab.
- History: Compare with… in an entry's … menu shows what changed between two saved scans of the same page (protections added, removed, changed in confidence or evidence) and copies it as Markdown.
- History: Select entries in the toolbar's … menu lets you tick several entries and pin, watch, export or delete them together; a search or a filter that hides an entry also unselects it.
- Webhook: a failed delivery can be sent again with Retry in Recent deliveries, and Settings → Detection → Webhook has Retry failed deliveries (on): after 1, 5 and 15 minutes when there was no answer or the server answered 408, 425, 429 or 5xx. The page data of a failed delivery stays in memory for an hour, never on disk.
- Rules: Test on this page in the rule editor runs the rule as edited (unsaved changes included) on the page the popup is open on, and shows what each cookie, URL, content and DOM pattern finds and whether its combinations fire; patterns only a real scan can answer are marked as such. Nothing is saved or sent.

### Changed

- Rules editor: Detection methods, Combinations, Check against History and Test on this page start folded, with the number of patterns and combinations in their headers.
- Settings → Detection: the Sites without JS hooks card starts folded under its title, like the other titled cards.

### Fixed

- History: pinning pages automatically pinned a new copy of the same page on every visit until all 50 pins were that page; each address is now pinned once.
- History watchlist: a check due when the browser starts is no longer lost, a check never leaves its background tab open, and pages that could not be checked are reported.
- Settings → Data → Reset keeps "only the sites I choose" instead of going back to scanning every site.
- Copy diagnostics leaves out more site names and short keys, and History's Markdown export gives addresses without their query, like every other copy.
- Detection: requests the previous page made after its scan no longer count as evidence on the next page opened in the same tab.
- Detection: a page that changes its own address (single-page apps, removed tracking parameters) no longer cancels its scan halfway.
- With the cache kept per page or per address, a page where nothing was found no longer shows the detections of another page of the same site.
- Detection: a page loaded from the cache no longer leaves the popup on "Searching", and scanning an open page again keeps its header evidence.
- History → Select: Pin and Watch count only the entries they changed.

## [3.0.3] - 2026-10-22

### Added

- Clicking a "Protections changed" notification opens that page; the backup-failed and History-full notices open Settings → History.
- Hovering the toolbar icon names what the page has (for example "Cloudflare 95%, DataDome 90%"), or says it is clean, skipped or switched off.
- Detection tab: Copy offers the uploaded summary, a Markdown table for tickets and chats, or JSON; none includes cookie or header values.
- Keyboard shortcut Alt+Shift+S (Control+Shift+S on Mac) scans the page again, and the popup can get a shortcut too; Settings → General opens the browser's shortcut settings.
- History: Open page and Scan again now in an entry's … menu, Scan again now in its details; a scan reloads the page's tab or opens one.
- Rules: Duplicate in a rule's … menu opens the editor on a copy that saves as a new custom rule; the original stays unchanged.
- Markdown export: History → Export and Settings → History write one row per page; Statistics → Export writes a report of totals, protections and sites.
- Settings → Detection → Webhook: Validate JSON under the payload template checks it now and selects the line that fails.

### Changed

- Webhook: the payload template shows its variables in colour, and the JSON check under it has an icon.
- Webhook Categories are chips like History's, and the tick boxes of History's export dialog match the rest of the interface.
- Advanced: when a page has only one protection with tools, its tools open straight away instead of one card to choose.

### Fixed

- History → Copy entry copied cookie and header values and address queries, which can hold live tokens; it now leaves them out, like every other copy.
- Webhook: the JSON check under the payload template names the right line for a stray bracket or a template that stops too soon; it said line 1.

## [3.0.2] - 2026-10-20

### Added

- History: filter chips under the search (Pinned, Changed, Anti-bot, Captcha, Fingerprint), and the search now also looks in your notes. When nothing matches, a message offers Clear filters. The export dialog can keep to changed pages only.
- Settings → Detection → Sites to scan: scan every site except the ones you skip (as before), or only the sites you choose; the Detection tab of a site that is not chosen offers Scan this site.
- Settings → Data → Storage: how much space the detection cache, tool captures, History, rules, pending rule updates, settings and logs use, with Clear for the cache, the captures, the pending updates, the logs and History.
- Settings → Data → Backup and restore: settings, your own rules and History in one file, restored whole or in parts, merging or replacing. Older exports still import as before.
- Settings → Data → Presets and reset: a Privacy and a Developer preset that list what they change, and Reset settings, which keeps your site lists, rules, History, language and theme.
- Settings → Data → Diagnostics: Copy diagnostics puts versions (the extension, the rule set, the installed rules), settings, counts and the pending rule updates on the clipboard for a bug report, with no sites, addresses or keys.
- Webhook: send only above a minimum confidence, for chosen categories or sites; sign each request with a secret (Scrapfly's own signature headers); Recent deliveries lists the last 20 attempts, with Clear.
- Settings → Detection → Sites without JS hooks: turn the JS hooks off on a site that misbehaves with them; nothing of the page or its frames stays wrapped, and its results say fingerprinting is not checked.
- Settings → History → Pin pages automatically: pages with a hard protection, or one you name, pin themselves (up to 50); a page you unpin stays unpinned.
- Settings → History: delete fingerprinting-only pages after a number of days of their own.
- Settings → History → Storage: choose a History size of 6, 12 or 25 MB (the extension now has the unlimited storage permission; History stays at 6 MB unless you choose more). A smaller size, or a lower entry limit, than History uses asks first, also when it comes from an imported settings file or a restored backup.
- History watchlist: pin a page and choose Watch for changes, and the extension scans it again every day or week in a background tab, marking it Changed (with a notification) when its protections change. Settings → History → Watch pinned pages.
- Rules editor: a bar notices the texts of a rule that are not translated into every language and one button translates them all, with Chrome's on-device translator.

### Changed

- Rules editor: Add combination puts the cursor in the new combination's name; the pattern list opens just below it.
- Rules → Check against History: the answer comes first, with a bar for how many saved pages match, clearer wording, and the Check button above the list.

### Fixed

- A site you skip is no longer scanned, cached or saved to History when you come back to its tab.
- A custom detector whose category says "WAF" or "bot" is listed with anti-bot everywhere (Detection, History and its export filter); some screens put it under Other.
- CHEQ, Meetrics, Ocule and ThreatMetrix are named Anti-Bot in History exports and webhooks, like every other anti-bot detector.
- Official detectors stay marked official, not custom, when the built-in detector index cannot be read.
- The toolbar badge uses the colours Settings → Badge colors shows from the start; until the first Save it used slightly different shades.
- A tag colour chosen in Settings now also colours the chips in the detection details, History and Rules, and an open popup follows without being reopened. The DOM tag is purple there, as in Settings.
- Statistics → Tools names every Advanced vendor like the Advanced tab; the CAPTCHA vendors added in 3.0 showed their internal ids.
- The cache tile says Domain, the real default scope, for results saved before the scope was recorded; it said Path.
- The rule editor shows 80 for a pattern with no confidence of its own (85 for a DOM pattern), the values detection uses; it showed 100.
- Statistics → Tools says how long captures are kept as set in Settings; it always said 30 minutes.
- The icon picker shows the same fingerprint icons as the rule cards; twelve of them were drawn differently.
- History details show a rule's uploaded icon, an emoji icon and the Scrapfly logo like the Detection tab does.
- Page notices from Advanced tools are laid out right to left in Arabic.
- Settings starts the cache duration from 7 days, not 12 hours, when a saved or imported file carries none.
- Settings → Data → Detection History (CSV) names the protections, which it wrote as [object Object], and is the same file as History → Export.
- The page buttons of the skipped sites list jumped several pages at a time once Settings had been opened more than once.
- Webhook: Send on every page load now sends pages answered from the cache; it did nothing before.
- The webhook receives everything found on a page; it used to miss detections found after the first moments of the scan.

## [3.0.1] - 2026-10-20

### Added

- Ten new interface languages, 22 in total: Traditional Chinese, Turkish, Indonesian, Vietnamese, Polish, Ukrainian, Dutch, Thai, Swedish and Czech. Pick one in Settings → General; rule descriptions and the rule editor's Translations are translated too.
- Traditional Chinese uses your system's Traditional Chinese fonts, so characters have their Taiwan and Hong Kong forms.
- Thai is drawn with the bundled IBM Plex Sans Thai font, like the other scripts, instead of whatever font the system has.
- Settings → History → What History saves: pause History, skip private-window pages (on by default), ignore sites, set a minimum confidence, skip fingerprint-only pages.
- History: pin an entry and add a note from its … menu. Pinned entries stay when History is cleaned up by age, entry limit, size or clear on close.
- History: a Changed badge on a page whose protections differ from its last scan, and optional notifications for all pages or only pinned ones.
- Settings → History: when a page is scanned again, update its earlier entry instead of skipping the scan.
- Settings → History: a storage meter, a warning when History nears its size limit, and how many old entries were removed.
- Settings → History: automatic backup to Downloads (daily, weekly or monthly) and Back up now; a large History is split into files that each import on their own, and a failed backup says why.
- History → Export: choose the format, protections, period, site and pinned pages only; the dialog shows how many entries will be exported.
- Settings → History: clear History when the browser closes (pinned entries stay).

### Changed

- Rules → Update downloads the rule texts of the language you use, not all of them.
- Settings → History: the export format and Include timestamps now apply to exports; JSON always keeps every field so it can be imported again.
- README: removed the Scrapfly tagline footer.

### Fixed

- Settings export and import now include the Advanced capture time.
- History: when the extension's background part was not reloaded after an update, Settings → History and the History tab say so instead of failing silently.
- History no longer drops its oldest entries without telling you.

## [3.0.0] - 2026-10-19

### Added

- An llms.txt at the repository root summarising what the extension is, how to install it and how to use each tab, for language models and quick reference.
- Settings → Detection: set how long Advanced tool captures are kept — any value from 1 minute to 7 days (default 30 minutes); the Advanced footer shows the chosen time.
- Statistics: anti-bot and CAPTCHA come first; fingerprinting stays hidden until you press Show fingerprinting, and the page says how much it hides.
- Statistics: a comparison with the previous period, four headline cards and a What changed card (new, rising, no longer seen, switched).
- Statistics → Overview: layered sites, how protected your pages are, estimated difficulty, and the hardest sites with their protection stacks.
- Statistics → Protections: strong-evidence share and change for every protection, and the protection stacks found together on a domain.
- Statistics → Domains: hardest-first list with search by domain or protection and filters for difficulty, CAPTCHA and changed.
- Statistics → Evidence: strong-evidence share per category, confidence by category, and "Mentioned, not confirmed" for protections found often with weak evidence.

### Changed

- Detection, History, Rules and Advanced: Google BotGuard, CHEQ, Meetrics, Ocule, ThreatMetrix, AliExpress CAPTCHA, Captcha.eu, Friendly Captcha and QCloud Captcha show their official logos instead of the generic icon, in both themes.
- Detection, History, Rules and Advanced: Hunt shows a neutral target icon, because no vendor or official logo exists for it.
- Advanced → reCAPTCHA callbacks: each client card no longer shows the version badge, the internal client ID or the site key.
- Detection and History: the text of matched combinations is soft grey instead of white.
- Rules: the ten detectors that got a logo have new versions, so a rule already saved from 2.8.9 shows its logo too.
- Rules: the list follows the category order chosen in Settings → Detection order, as the Detection list and History do.
- Rules editor: Translations is a clear row with a chevron and a count badge, each translation is a box that shows the whole text, and Translate automatically is a smaller button.
- Statistics: Confidence, Signals and Combinations are views of one Evidence tab; the tab bar is slimmer and stays in view while you scroll.
- Statistics: one Export menu replaces the two buttons, and export file names use your local date and the range.
- Statistics: protection changes compare saved copies of the same page, not the whole domain.
- Statistics → Activity: the calendar fills its card, today is drawn as still counting, and daily pages show a 7-day average.
- Statistics: charts show the whole range instead of pages of 30 days; light-theme colours read on white and the layout follows Arabic.
- Statistics → Rules: rules that found nothing separate custom rules worth a look from official ones that are normally quiet.
- Statistics → Tools: only captures that have not expired are listed, with when they expire.
- Statistics: the Show chips use the Anti-bot, Captcha and Fingerprint icons instead of a coloured dot.
- Statistics: protection chips carry their category's icon instead of a coloured dot, and the Captcha filter uses the Captcha icon.
- Statistics → Domains: the "+N more" chip is a solid chip that lists the hidden protections on hover, not a dashed outline.
- Statistics: category badges, chart legends and the chart tooltip use the Anti-bot, Captcha and Fingerprint icons instead of a coloured dot.
- Statistics: each protection shows its own logo (in the Protections and Domains lists, the headline cards and What changed), with the category icon as a fallback.

### Fixed

- Statistics: layered sites now means protections found together on one saved page, not a domain that met several over time.
- Statistics: long hostnames and narrow windows no longer push the page sideways or overlap other columns.
- Statistics: entries with a missing or impossible date no longer stretch the range or the calendar.
- Statistics → Domains: opening a domain from another tab clears old filters, and Space opens a row as Enter does.
- Statistics: Escape also closes tooltips, and focus stays on the chip, search or sort you just used.
- Statistics: with no earlier history the page says there is no previous period yet, instead of showing a change.
- Statistics: the difficulty hint names the categories shown, plural counts read correctly in more languages, and Activity says when its list is cut.
- Statistics → Activity: month colours in the calendar are readable in both themes.
- Settings: the language menu uses the same surface colour as the rest of the settings, instead of a darker panel.
- Settings: the Data tab icon tiles and the colour field adapt to the light theme instead of staying a dark box, and the accent tiles now share one surface colour.
- Language: after the extension updates, newly added text appears in your chosen language instead of briefly falling back to English.
- Detection summary: the Detections icon is purple and the Cache icon is teal, so the four stat cards read apart at a glance (Confidence and Difficulty keep their value colour).

## [2.8.9] - 2026-10-16

### Added

- Rules editor: a detector has its own Description, with Translations and Translate automatically, shown in its detection details.
- Detection: hCaptcha's widget frame, CHEQ's own-domain check endpoint and self-hosted FingerprintJS builds are now recognised.

### Changed

- Detection: Google BotGuard's www.google.com/js/th/… script is proof on its own too, so it shows 100% instead of 75%.
- Detection: 78 more anti-bot signals and 44 CAPTCHA signals only one vendor produces (its own script host, cookie, header or challenge request) show 100% on their own; CAPTCHAs could not before.
- Detection: short cookie names (_px3, _pxhd, _pxvid, ak_bmsc, cf_clearance, __cf_bm, __uzm, aws-waf-token) must also have the right value shape to count as proof.
- Detection: F5, PerimeterX and CHEQ give 100% only to the branch made of their own signals; the first-party, legacy and tag-manager branches keep 95%.
- Detection: a vendor's complete integration shows 100% too, except Turnstile, Azure Front Door, Yundun, Hunt and AliExpress, whose signals other products share.
- Detection: a page's difficulty can rise from Low to Medium when one vendor's script is the only evidence, because that script now scores 100%.
- Detection: Akamai's sensor, pixel and SBSD requests are matched by their exact path, and Aliyun's captcha no longer counts its device-fingerprint module as the captcha.
- Detection: AWS WAF's regional token host is recognised with two or three path segments, as o2.co.uk sends it.
- Rules → Update: 51 detectors have new versions (26 anti-bot, 18 CAPTCHA, 7 fingerprint), so the update offers them.
- Rules: the changed rule descriptions and combination names are translated into all 11 languages.
- Fingerprint: ordinary page behaviour (reading localStorage, the CPU count, the pixel ratio or the languages) scores lower, so clean pages show less noise.
- Dark theme: protection logos on the Detection tab and in History details also sit on dark tiles instead of white squares; the light theme is unchanged.
- Detection: Kasada shows its official logo on the Detection tab, in History, in Rules and in Advanced, in both themes.
- Development: tests cover the search screen finishing when its completion message never arrives, and a page that is still loading.
- Development: the confidence tests now define what 100% means (a proof list, the capped detectors, a top tier of 100%), with a live witness for each changed rule.
- Development: the live-site check list expects 100% where a site reliably shows its proof, and the README explains what 100% means and how to add a proof rule.

### Fixed

- Detection: on slow or reloading pages such as Nike, the "Searching protections" screen no longer stays stuck, or flashes "Scan interrupted" or "Nothing Detected", before the result.
- Detection: long cookie values (Cloudflare, PerimeterX, AWS WAF) were cut before matching, so those cookies never counted; they now do.
- Detection: Turnstile widgets served from Cloudflare's China or FedRAMP hosts no longer show as Cloudflare Bot Management at 100%.

## [2.8.8] - 2026-10-15

### Added

- Detection: DeepSeek PoW and OpenAI Sentinel (ChatGPT) anti-bots, with their logos, each showing its proof-of-work challenge. The Turnstile check Sentinel asks for shows under Cloudflare Turnstile, marked as OpenAI's own.
- Detection: a rule can now read the response of the URLs it names, such as a challenge asking for a proof of work. Evidence that comes after the scan, like a challenge sent when you post a message, is added to the page's result.

### Changed

- Rules editor: a combination's "Combinations only" row shows how many of its patterns are marked and offers Mark all / Unmark all, instead of a half-ticked checkbox.
- Advanced → History: every card shows the tool that made it as a tag, Analyze Scripts and captures included, and the tool filter lists Analyze Scripts results under their own name.
- Detection: Google BotGuard's own script (www.google.com/js/bg/…) is proof on its own, so it shows 100% instead of 75%.
- Dark theme: protection logos in Rules and in Advanced's supported protections sit on dark tiles instead of white squares; the light theme is unchanged.
- Cloudflare: a /cdn-cgi/challenge-platform/ challenge or bot-detection script on the page is proof (100%), its newer script path included; Turnstile's own frames are not.
- Detection details: a matched request body shows the text that matched instead of the rule's pattern.

### Removed

- Advanced: Cloudflare Bot Management no longer offers Extract Site Key; the Turnstile site key stays under Advanced → Cloudflare Turnstile.

### Fixed

- Advanced: hCaptcha Check Version no longer reports Enterprise on standard site keys, such as hCaptcha's own demo page.
- Advanced: Analyze Scripts on slow pages lists what loaded within 30 seconds instead of "Failed to start analysis", and no longer lists the page itself.
- Advanced: Extract site key finds Friendly Captcha v2, older Yandex SmartCaptcha and Captcha.eu keys, and FunCaptcha keys from Arkose's iframe embed.
- Advanced: script lists for Captcha.eu, Prosopo, MTCaptcha and Capy no longer include files from the vendor's own website.
- Cloudflare: detection and Check Cookies now see cf_clearance, a partitioned cookie; Analyze Scripts clears it first so the bot-management scripts load again.
- Advanced: the Check Cookies notification shows the same count as the cookie window.
- Rules editor: a long method name, such as "Interceptores de JavaScript", no longer runs into its pattern count; it is cut with "…" and shown whole on hover.

## [2.8.7] - 2026-10-14

### Added

- Advanced: tools for 14 more CAPTCHAs (Prosopo, Friendly Captcha, MTCaptcha, Yandex SmartCaptcha, Captcha.eu, QCloud, NetEase Yidun, Aliyun, Dingxiang, Shumei, Capy, Binance, Basilisk, AliExpress): Extract site key where they have one, Analyze scripts for all.
- Rules editor: each pattern in a combination has a "Combinations only" button to turn it on or off.
- Advanced: Extract site key for hCaptcha and Extract public key for FunCaptcha; Akamai Check cookies also lists bm_s, bm_so, bm_lso, AKA_A2 and waiting-room cookies.
- Advanced: FunCaptcha and hCaptcha script results have Export Code, like the other protections.

### Changed

- Advanced: the tools information window is redesigned and larger; it lists all 25 supported protections by category, with their real logos.
- Detection details: a matched value is plain text instead of a box that copied it on click.
- Advanced: cookie results show each cookie's name as its own copyable row, above its value.
- Advanced → History: capture details for every protection use the same layout as the cookie results, with copyable rows and Copy all data at the bottom.
- Advanced → Analyze scripts: one results window for every protection, with each script's type and an Export code button; it lists only that protection's requests, not look-alike paths or images.
- Advanced: the GeeTest, Imperva and Shape Security result windows use the same layout as the others; Cloudflare Check cookies looks for the real Cloudflare cookies.
- Advanced: with no protection on the page, the screen says so, gives the minimum confidence and where to change it, or names a protection detected below that minimum; the supported list shows each protection's logo grouped by Anti-bot and Captcha.
- The mouse pointer no longer turns into the system's spinning wait cursor while a tool or upload works; the button shows its own progress.
- Advanced → reCAPTCHA: Extract site key reports only reCAPTCHA keys, including v3 keys and keys inside frames; Click says when nothing was found.

### Fixed

- Rules and History: the last card on a page is no longer cut off by the page bar at the bottom; its outline shows in full.
- Detection: typing in the search box no longer makes the cards flash; they update in place.
- Advanced → History: the empty "No captures yet" card no longer has a blue strip along its top.
- Rules editor: "These patterns only count together" can be ticked on a new combination before adding patterns.
- Advanced → DataDome → Analyze Scripts: now finds the challenge scripts and the CAPTCHA or interstitial page on blocked pages, not only tags.js.
- Advanced: tools that reload the page (Analyze scripts, version checks, Akamai sensor) now show they are working until the result opens, and an empty result says no scripts were found.
- Advanced → Turnstile → Export Code: the JavaScript and Node.js code no longer calls a helper that only exists inside the extension.
- Advanced → Imperva: the ___utmvc cookie is found and reset, Analyze scripts finishes a few seconds after the page loads instead of up to a minute, and Node.js export code fetches the page.
- Advanced → hCaptcha: Enterprise is detected from the challenge request too, and no longer reported for sites whose configuration only lists general features; Check version no longer shows a late timeout after its result.
- Advanced → FunCaptcha: Start capture also records form-encoded challenge requests.
- Advanced → GeeTest and Shape Security: Check version no longer reports a version on pages without the protection.
- Advanced → Akamai: Start capture no longer deletes the _abck cookie when it only stops a running capture; Extract sensor reports when no data arrives.
- Advanced: results from one tab no longer open in another tab's tools; tools that finish at once no longer stay busy.

## [2.8.6] - 2026-10-13

### Added

- Rule editor: each combination has Name translations with Translate automatically, like a pattern's description, so your own combinations show in every language.

### Changed

- History: a card's lower row reads detections, confidence and difficulty, then the category totals, with the time at the far right.
- History: cards show the page's full address instead of only its domain, cut off when long; hover shows all of it.
- Settings: changes wait for Save; theme and language clearly indicate when they apply immediately.
- Keyboard navigation now supports the main tabs and returns focus after closing tool and History dialogs.
- Detection: larger cards with a bigger icon and name; a card's evidence shows each method as an icon with its count, in its Settings → Tag Colors colour, plus a mark when a combination decided it; hover names them.
- Detection and History: hovering a card tints it light blue instead of outlining it.
- Settings: cards with a title start folded and open on click, so each tab is shorter.
- Detection and History details: matched combinations start folded, showing their name and confidence; a click opens what was found.
- Detection and History details: section titles such as Description and Matched combinations stand out from the text, in blue with a rule beside them.
- Settings: JS API events are off by default; a choice already saved is kept.
- Rule editor: a pattern's settings button no longer gets a coloured background when settings are set; the RX and CS tags already show them.

### Fixed

- Rule editor: a combination's confidence and delete button line up with its name.
- Toolbar: the scanning spinner turns from the moment a page loads instead of freezing on its first frame, and keeps turning while the rules run.
- Rule editor: a pattern's Translations count includes the translations the extension ships, so an official text no longer reads "0 of 11".
- Rule editor: "Translate automatically" fills every language without a translation in one click, instead of only the first, and leaves shipped translations alone.
- Rule editor: combination names and pattern descriptions in combinations show in the extension's language; editing one still edits the original text.
- Detection no longer stops after three strong matches, missing other protections on the same page.
- Failed and interrupted scans no longer appear as completed scans with no detections.
- Reloading or switching pages no longer lets an older scan overwrite the current scan’s state.
- Rules: failed saves preserve the draft; invalid imports leave existing rules intact, and updates protect custom patterns and edits.
- Settings: concurrent saves preserve unrelated changes, and failed imports retain the current settings and language.
- Advanced: overlapping captures stay separate, analysis jobs have a deadline, and saved tool results survive closing the popup.
- Advanced: capture history writes no longer overwrite one another, and generated examples run without extension-only helpers.
- Scrape with Scrapfly: terminal instructions match Bash or WSL, and embedded scripts cannot prematurely end their generated file.

### Security

- Page-facing detection events expose summaries without raw cookie, header or payload evidence.
- Settings exports omit integration connection details; imports preserve local connections, and webhook requests refuse redirects.
- Scrape with Scrapfly: Copy for AI removes header values from generated examples as well as their description.

## [2.8.5] - 2026-10-12

### Added

- Detection: Binance Captcha, Prosopo Procaptcha, Basilisk (FaucetPay) captcha, Cloudflare Waiting Room and the Hunt anti-bot used on betting sites.
- Statistics → Signals: which methods found each protection (cookies, headers, URLs, hooks…), the most matched signals with their descriptions, and the weakest evidence.
- Statistics → Combinations: how many detections a combination decided, which combinations fired, and their confidence next to single patterns.
- Statistics → Rules: official, custom, edited and disabled rules, rules that found nothing in the range, and patterns still missing a description.
- Statistics → Tools: Advanced captures and tool results by vendor, tool and day; the tab appears once something is saved.
- Statistics → Domains: protection changes between visits, protections new in the range, and protections found together.
- Rule descriptions and combination names now follow the extension's language (all 12); a pattern's Settings has a Translations section, with automatic translation in Chrome 138+.
- Settings → Theme: a light theme in Scrapfly's colours, next to Dark (the default) and System, which follows the browser.
- Scrape with Scrapfly: every Scrape API and Cloud Browser option (rendering, screenshots, browser actions, headers, cache, sessions, AI extraction, blocking, Unblock first…) in folded sections, written correctly for each language.
- Rules: "Check against History" in the rule editor shows on how many saved pages each pattern and combination matches, unsaved edits included.

### Changed

- Detection: results are cached for 7 days by default instead of 12 hours; a duration already saved in Settings is kept.
- Settings → Detector updates: the automatic check runs once a week by default instead of every 12 hours; an interval already saved is kept.
- Detection: cards redesigned, grouped under category headers, with difficulty as the one coloured tag; the evidence line lists every method, wraps when long and counts each on hover; cache scope and expiry share one tile.
- Detection: the "Scanning this page" categories show their icons.
- Detection: the search box is part of the page summary card.
- History: cards show the number of anti-bot, captcha and fingerprint protections with their icons instead of logos cut at "+N"; hover names them.
- Akamai: the _abck cookie or the Pixel challenge variable alone now mean 100% confidence.
- Settings → Debug Mode: an "Open console" button and a line saying what Verbose logs and Log Collector do; console lines are shorter, coloured and say each action once.
- Detection details: the "Sets the detection score" line is gone; the highlighted combination already shows it.
- Statistics: Overview adds "New this period" and the most protected domain; exports include each detection's methods and combinations.
- Detection: Scrape with Scrapfly is now the first button in the page toolbar, away from Block this domain.
- Rule editor: a new pattern has a description field right in its row, and a pattern's description can be edited directly in a combination.

### Fixed

- Rules: an update installed in the background is no longer undone by the next rule edit, and a rule edited while an update downloads keeps the edit.
- Detection and History: search no longer stops working when a saved protection has no name.
- Detection: clearing the search shows the results in the Settings order again instead of fingerprints first.
- Settings: saving no longer undoes a domain blocked from Detection or History while Settings was open.
- Scrape with Scrapfly: the Go code no longer turns retries off by leaving them out.
- Detection: requests a page makes after it loads, or through its own service worker, now count, so captcha and anti-bot calls made a second later are no longer missed.
- Rules: JavaScript hooks now work in Anti-bot and CAPTCHA rules too, not only Fingerprint; the warning saying they were ignored is gone.

## [2.8.4] - 2026-10-09

### Added

- Anti-bot: Amazon Bot Protection, found on Amazon sign-in pages by the hidden metadata1 fingerprint field and the FWCIM scripts.

### Changed

- Rule editor: every pattern's description (the text shown in detection details and History) can be edited in its Settings.
- Detection: the search field looks the same as in History and Rules.
- Settings → Detection order: drag the Anti-bot, Captcha and Fingerprint cards to order detections, or list the highest confidence first; History follows it too.
- Advanced → Akamai: Analyze Scripts, Extract Sensor Information and Capture Details use the cleaner dialog style, with Copy buttons that no longer cover the text.
- Advanced → History: cards keep the vendor and tool name on one line and show the size next to the time.
- Advanced → Check Cookies: long cookie values show three lines and their length instead of filling the dialog; clicking still copies the full value.
- Advanced: Analyze Scripts, Check Version and Akamai Extract Sensor Information no longer show a notice box on the website; progress and results stay in the popup.
- Advanced → hCaptcha: Check Version shows the version, site key and page as copyable rows, with Enterprise mode as a badge.

### Fixed

- Detection: results that arrive after a slow scan now show instead of failing with an error.
- Advanced → hCaptcha: Check Version no longer reports a timeout after it already showed the version.
- Rules: "Restore official detectors" installs missing official detectors from the latest GitHub release (the built-in copy when offline), including ones older versions removed, and lists them first.

## [2.8.3] - 2026-10-08

### Added

- Rules: each card's "⋯" menu can export just that detector.
- History: each card has a Scrapfly button that opens Scrape with Scrapfly for that page.

### Changed

- Scrape with Scrapfly: turn the Unblocker and JavaScript rendering (both on by default) on or off, and pick output, proxies (residential by default) and country; the code updates as you pick.
- Scrape with Scrapfly: Copy for AI copies the page, its protections, your settings and the code as one message ready for an AI assistant.
- Scrape with Scrapfly: pages with a CAPTCHA now get Cloud Browser code with the Captcha Solver, which solves CAPTCHAs on forms and waits for each solve before reading the page; switch back to the Scrape API anytime.
- Scrape with Scrapfly: the dialog is laid out as four numbered steps, from settings to running the code.
- Detection details: each matched combination says in plain words what it found on the page, and marks the one that set the score.
- History details: matched combinations are shown too, and the list of matches is titled "Matched detections".
- Rules editor: combinations show each pattern's description first, and "one of" groups can be added, changed and deleted.
- Rules editor: one Test pattern dialog replaces the six Regex, Whole word and Case sensitive helpers; it opens with your pattern and tests sample text exactly as detection does.
- Rules editor: each detection method's "?" explains what it checks, how it matches and its limits, with examples from Scrapfly's own rules; several old texts were wrong.
- Rules editor: the DOM selector and Window property helpers open from each pattern's settings, show more suggestions per page, and the settings button is blue.
- JS API: matched combinations list which of their patterns were found.
- Detectors: ThreatMetrix, AWS WAF, Cloudflare, Screen and IndexedDB combinations now score above their single signals; three unused Jiasule and Radware signals count alone.
- Google BotGuard is also recognised on Gmail, from its /waa requests and the /js/bg/ interpreter script.
- Rules → Update installs the latest Scrapfly release in one click and lists what changed; Settings → Check now does the same.
- Rules that need a newer extension are no longer offered as updates; the Rules tab says which extension version they wait for.

### Fixed

- Rules editor: saving no longer fails after emptying a group, and removing a condition no longer lets weak patterns detect on their own.
- Advanced: the History count goes up as soon as a tool saves a result, instead of only when the History tab is opened.
- F5: the "ASM cookie with BIG-IP analytics" combination now shows; before, the load-balancer combination always took its place.
- Detection: pages that never finish loading are now scanned after a short wait instead of never showing a result.
- Rules → Update no longer says everything is up to date when some rules failed to download, and explains GitHub outages and rate limits.
- Rules editor: a regex or selector picked in a helper no longer stays when you cancel the pattern settings.
- Rules editor: JS hooks now say they only work in Fingerprint rules, and DOM selectors no longer offer Regex, Whole word and Case sensitive, which detection ignores.
- Dropdown lists scroll with the extension's thin scrollbar instead of the system bar with arrows.

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

[3.0.7]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.6...v3.0.7
[3.0.6]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.5...v3.0.6
[3.0.5]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.4...v3.0.5
[3.0.4]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.3...v3.0.4
[3.0.3]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/scrapfly/Antibot-Detector/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.9...v3.0.0
[2.8.9]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.8...v2.8.9
[2.8.8]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.7...v2.8.8
[2.8.7]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.6...v2.8.7
[2.8.6]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.5...v2.8.6
[2.8.5]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.4...v2.8.5
[2.8.4]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.3...v2.8.4
[2.8.3]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.2...v2.8.3
[2.8.2]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8.1...v2.8.2
[2.8.1]: https://github.com/scrapfly/Antibot-Detector/compare/v2.8...v2.8.1
[2.8]: https://github.com/scrapfly/Antibot-Detector/compare/v2.7...v2.8
[2.7]: https://github.com/scrapfly/Antibot-Detector/compare/v2.6...v2.7
[2.6]: https://github.com/scrapfly/Antibot-Detector/compare/v2.5...v2.6
