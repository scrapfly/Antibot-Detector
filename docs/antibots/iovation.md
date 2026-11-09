**English** | [Español](es/iovation.md) | [Русский](ru/iovation.md) | [简体中文](zh-CN/iovation.md) | [日本語](ja/iovation.md) | [Português (Brasil)](pt-BR/iovation.md) | [Deutsch](de/iovation.md) | [Français](fr/iovation.md) | [한국어](ko/iovation.md)

# iovation (TransUnion TruValidate) bot protection: how to detect it (and what it means for scraping)

iovation (TransUnion TruValidate) is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a iovation (TransUnion TruValidate) bypass, trying to detect iovation (TransUnion TruValidate) on a site, or investigating web scraping blocked by iovation (TransUnion TruValidate), the first step is the same: confirm that iovation (TransUnion TruValidate) is really what answers your requests. This page lists the 9 public signals that the Scrapfly Antibot Detector extension uses to recognise iovation (TransUnion TruValidate) bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

iovation is a device recognition and fraud prevention service now part of TransUnion as TruValidate. Its script collects a device blackbox that the site submits with sensitive actions.

Official site: [https://www.iovation.com/](https://www.iovation.com/)

## How to tell a site uses iovation (TransUnion TruValidate)

These signals are generated from the extension's own detection rules for `detect-iovation` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (corroboration only) | iovation logo.js served through the site's own /iojs/ proxy |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (corroboration only) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (corroboration only) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (corroboration only) | io_global_object_name setting read by the iovation scripts |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (corroboration only) | Hidden ioBlackBox field that receives the iovation blackbox |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) or iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) and (IGLOO.getBlackbox function of the iovation loader or IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy or iovation logo.js served through the site's own /iojs/ proxy) and (IGLOO.getBlackbox function of the iovation loader or IGLOO.fp object created by the iovation profiling scripts or io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader or IGLOO.fp object created by the iovation profiling scripts) and (io_global_object_name setting read by the iovation scripts or iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) or Hidden ioBlackBox field that receives the iovation blackbox) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If iovation (TransUnion TruValidate) is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by iovation (TransUnion TruValidate) without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists iovation (TransUnion TruValidate) with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
