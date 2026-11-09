**English** | [Español](es/kasada.md) | [Русский](ru/kasada.md) | [简体中文](zh-CN/kasada.md) | [日本語](ja/kasada.md) | [Português (Brasil)](pt-BR/kasada.md) | [Deutsch](de/kasada.md) | [Français](fr/kasada.md) | [한국어](ko/kasada.md)

# Kasada bot protection: how to detect it (and what it means for scraping)

Kasada is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Kasada bypass, trying to detect Kasada on a site, or investigating web scraping blocked by Kasada, the first step is the same: confirm that Kasada is really what answers your requests. This page lists the 8 public signals that the Scrapfly Antibot Detector extension uses to recognise Kasada bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Kasada is a bot mitigation vendor. It runs client-side checks in the browser and attaches proof to later requests, so requests made without that proof are likely to be refused.

Official site: [https://www.kasada.io/](https://www.kasada.io/)

## How to tell a site uses Kasada

These signals are generated from the extension's own detection rules for `detect-kasada` (rule version 2.1.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-kpsdk-ct$` | 100% | Kasada client token header on protected responses |
| `^x-kpsdk-(?:r\|cd\|st\|im\|v\|h)$` | 40% (corroboration only) | Other Kasada response headers |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:ips\|p)\.js(?:[?#]\|$)` | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]{1,8}(?:\.js)?)?\?(?:[^#]*&)?(?:x-kpsdk-im\|KP_UIDz)=` | 40% (corroboration only) | Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:tl\|fp\|mfc)(?:[?#]\|$)` | 100% | Kasada telemetry or fingerprint endpoint on the double-UUID path |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `KPSDK\.(?:configure\|start\|now)` | 10% | KPSDK API call in page scripts |
| `kpsdk-load` | 10% | Kasada load event name |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `KPSDK (typeof object)` | 75% | Kasada KPSDK object |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Client script with KPSDK running | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) and (Kasada KPSDK object or KPSDK API call in page scripts or Kasada load event name) |
| Kasada token headers with its script or interstitial | 100% | (Kasada client token header on protected responses or Other Kasada response headers) and (Kasada client script on its double-UUID first-party path (ips.js or p.js) or Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) or Kasada telemetry or fingerprint endpoint on the double-UUID path) |
| Interstitial script with KPSDK query | 90% | Kasada client script on its double-UUID first-party path (ips.js or p.js) and Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Kasada is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Kasada without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Kasada with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
