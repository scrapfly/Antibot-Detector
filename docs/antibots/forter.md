# Forter bot protection: how to detect it (and what it means for scraping)

Forter is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Forter bypass, trying to detect Forter on a site, or investigating web scraping blocked by Forter, the first step is the same: confirm that Forter is really what answers your requests. This page lists the 7 public signals that the Scrapfly Antibot Detector extension uses to recognise Forter bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Forter is a fraud prevention vendor for online commerce. Its script fingerprints the browser and the site sends the resulting token with checkout and login decisions.

Official site: [https://www.forter.com/](https://www.forter.com/)

## How to tell a site uses Forter

These signals are generated from the extension's own detection rules for `detect-forter` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^forterToken$` | 90% | forterToken cookie set by the Forter script |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://[0-9a-f]{12}\.cdn4\.forter\.com/sns?/[0-9a-f]{12}/(?:[^?#]*/)?script\.js(?:[?#]\|$)` | 100% | Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) |
| `^https://(?:[0-9a-f-]+\.)?cdn\d*\.forter\.com/(?:events\|[^?#]*\.json)(?:[?#]\|$)` | 100% | Forter collection request to a forter.com CDN host (prop.json, wpt.json, events) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `\bftr__(?:startScriptLoad\|config)\b` | 20% (corroboration only) | Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `ftr__config (typeof object)` | 60% | ftr__config object set by the Forter loader snippet |
| `ftr__startScriptLoad (typeof number)` | 50% (corroboration only) | ftr__startScriptLoad timestamp set by the Forter loader snippet |
| `ftr__JSON3 (typeof object)` | 50% (corroboration only) | ftr__JSON3 object set by the Forter script |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Forter script with its token cookie or config | 100% | (Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) or Forter collection request to a forter.com CDN host (prop.json, wpt.json, events)) and (forterToken cookie set by the Forter script or ftr__config object set by the Forter loader snippet) |
| forterToken cookie with the Forter runtime | 100% | forterToken cookie set by the Forter script and (ftr__config object set by the Forter loader snippet or ftr__startScriptLoad timestamp set by the Forter loader snippet or ftr__JSON3 object set by the Forter script or Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config)) |
| Forter loader globals together | 85% | ftr__config object set by the Forter loader snippet and (ftr__startScriptLoad timestamp set by the Forter loader snippet or ftr__JSON3 object set by the Forter script) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Forter is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Forter without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Forter with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
