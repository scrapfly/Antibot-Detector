# HUMAN (PerimeterX) bot protection: how to detect it (and what it means for scraping)

HUMAN (PerimeterX) is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a HUMAN (PerimeterX) bypass, trying to detect HUMAN (PerimeterX) on a site, or investigating web scraping blocked by HUMAN (PerimeterX), the first step is the same: confirm that HUMAN (PerimeterX) is really what answers your requests. This page lists the 12 public signals that the Scrapfly Antibot Detector extension uses to recognise HUMAN (PerimeterX) bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

PerimeterX is now part of HUMAN Security. Its bot defender places a script on the page and scores visitors by behaviour and device signals, and can answer with a press-and-hold style challenge.

Official site: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## How to tell a site uses HUMAN (PerimeterX)

These signals are generated from the extension's own detection rules for `detect-perimeterx` (rule version 2.3.1, last updated 2026-10-30). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (corroboration only) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (corroboration only) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (corroboration only) | Optional PerimeterX init callback defined by the site |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID or First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) or PerimeterX application ID or PerimeterX collector endpoint) and (PerimeterX risk token cookie (_px2 or _px3) or PerimeterX first-party server cookie or PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | at least 2 of: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host and (PerimeterX application ID or Script assigning the PerimeterX app ID (window._pxAppId) or Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) and (PerimeterX application ID or Script assigning the PerimeterX app ID (window._pxAppId) or Optional PerimeterX init callback defined by the site) |

## Difficulty

**High.** High means the extension rates this protection as among the hardest to get past: it typically combines client-side checks with behavioural or server-side scoring.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If HUMAN (PerimeterX) is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by HUMAN (PerimeterX) without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists HUMAN (PerimeterX) with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
