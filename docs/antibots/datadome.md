**English** | [Español](es/datadome.md) | [Русский](ru/datadome.md) | [简体中文](zh-CN/datadome.md) | [日本語](ja/datadome.md) | [Português (Brasil)](pt-BR/datadome.md) | [Deutsch](de/datadome.md) | [Français](fr/datadome.md) | [한국어](ko/datadome.md)

# DataDome bot protection: how to detect it (and what it means for scraping)

DataDome is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a DataDome bypass, trying to detect DataDome on a site, or investigating web scraping blocked by DataDome, the first step is the same: confirm that DataDome is really what answers your requests. This page lists the 11 public signals that the Scrapfly Antibot Detector extension uses to recognise DataDome bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

DataDome is a French bot and online fraud protection vendor. It scores requests with a JavaScript tag and server-side signals and can answer with a challenge or a block page.

Official site: [https://datadome.co/](https://datadome.co/)

## How to tell a site uses DataDome

These signals are generated from the extension's own detection rules for `detect-datadome` (rule version 2.1.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (corroboration only) | DataDome block-type header on challenge responses |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/(?:tags\.js\|js/)` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:geo\|ct\|c\|t)\.captcha-delivery\.com/` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (corroboration only) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (corroboration only) | DataDome block page bootstrap (var dd={'rt':...}) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint or DataDome JS key set by the integration snippet or Integration snippet setting window.ddjskey) and DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header or DataDome protection response header or Response served by DataDome itself (block or challenge page)) and DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only and (DataDome JS key set by the integration snippet or Integration snippet setting window.ddjskey) |
| DataDome block page | 95% | DataDome block page bootstrap (var dd={'rt':...}) and (DataDome client ID response header or DataDome block-type header on challenge responses or DataDome challenge or CAPTCHA delivery host or DataDome session cookie) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If DataDome is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by DataDome without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists DataDome with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
