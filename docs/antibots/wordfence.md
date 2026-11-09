# Wordfence bot protection: how to detect it (and what it means for scraping)

Wordfence is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Wordfence bypass, trying to detect Wordfence on a site, or investigating web scraping blocked by Wordfence, the first step is the same: confirm that Wordfence is really what answers your requests. This page lists the 19 public signals that the Scrapfly Antibot Detector extension uses to recognise Wordfence bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Wordfence is a popular WordPress security plugin. It adds a firewall, rate limiting and login protection to a single WordPress site.

Official site: [https://www.wordfence.com/](https://www.wordfence.com/)

## How to tell a site uses Wordfence

These signals are generated from the extension's own detection rules for `detect-wordfence` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^wfwaf-authcookie-[0-9a-f]{32}$` | 60% | Wordfence firewall cookie wfwaf-authcookie-<hash> set for logged-in users |
| `^wf_loginalerted_[0-9a-f]{64}$` | 60% | Wordfence new-device login alert cookie wf_loginalerted_<hash> |
| `^wfls-remembered-[A-Za-z0-9_-]{20,24}$` | 60% | Wordfence Login Security cookie wfls-remembered-<id> for a device that passed 2FA |
| `^wfCBLBypass$ = ^[0-9a-f]{13}$` | 60% | Wordfence country blocking bypass cookie wfCBLBypass |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence(?:-login-security)?/(?:modules/login-security/)?js/(?:login\|wflsi18n)\.\d+(?:\.min)?\.js(?:[?#]\|$)` | 90% | Wordfence Login Security login script or its translations |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence/(?:js\|css)/[\w.-]+\.(?:js\|css)(?:[?#]\|$)` | 80% | Script or stylesheet from the Wordfence plugin's own js or css folder |
| `^https?://[^/?#]+/(?:[^?#]*/)?\?wordfence_lh=1&hid=` | 50% | Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `WFLSVars` | 30% | Script defining WFLSVars, the Wordfence Login Security settings |
| `WFAJAXWatcherVars` | 30% | Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings |
| `wfLogHumanRan` | 20% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) |
| `_wfsf=unlockEmail` | 20% | Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) |
| `user-reports.wordfence` | 20% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `WFLSVars (typeof object)` | 60% | Wordfence Login Security settings object |
| `WFLSVars.useCAPTCHA (truthy)` | 60% | Wordfence Login Security reCAPTCHA turned on |
| `wordfenceAJAXWatcher (typeof object)` | 60% | Wordfence firewall watcher object |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `a[href="https://www.wordfence.com/help/?query=locked-out"]` | 30% (corroboration only) | Locked-out documentation link on the Wordfence block page |
| `input#unlock-email` | 20% (corroboration only) | Unlock email field on the Wordfence block page |
| `input[name="wfwaf-false-positive-verified"]` | 50% | Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins |
| `a#reportButton` | 10% (corroboration only) | Report Problem button on the Wordfence blocklist page |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Login Security script with its settings | 100% | Wordfence Login Security login script or its translations and (Wordfence Login Security settings object or Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security with reCAPTCHA turned on | 100% | Wordfence Login Security reCAPTCHA turned on and (Wordfence Login Security login script or its translations or Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security settings in a script and at runtime | 90% | Script defining WFLSVars, the Wordfence Login Security settings and Wordfence Login Security settings object |
| Live Traffic script and its report request | 85% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) and Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |
| Firewall watcher script with its settings | 90% | Script or stylesheet from the Wordfence plugin's own js or css folder and (Wordfence firewall watcher object or Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings) |
| Wordfence block page help link with its unlock form or allowlist field | 85% | Locked-out documentation link on the Wordfence block page and (Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) or Unlock email field on the Wordfence block page or Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins) |
| Wordfence blocklist page report script and button | 80% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) and Report Problem button on the Wordfence blocklist page |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Wordfence is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Wordfence without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Wordfence with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
