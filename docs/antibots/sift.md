**English** | [Español](es/sift.md) | [Русский](ru/sift.md) | [简体中文](zh-CN/sift.md) | [日本語](ja/sift.md) | [Português (Brasil)](pt-BR/sift.md) | [Deutsch](de/sift.md) | [Français](fr/sift.md) | [한국어](ko/sift.md)

# Sift bot protection: how to detect it (and what it means for scraping)

Sift is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Sift bypass, trying to detect Sift on a site, or investigating web scraping blocked by Sift, the first step is the same: confirm that Sift is really what answers your requests. This page lists the 6 public signals that the Scrapfly Antibot Detector extension uses to recognise Sift bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Sift is a digital trust and fraud prevention platform. Its page snippet reports device and page-view data to Sift for risk scoring.

Official site: [https://sift.com/](https://sift.com/)

## How to tell a site uses Sift

These signals are generated from the extension's own detection rules for `detect-sift` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^__ssid$` | 30% (corroboration only) | __ssid visitor cookie the Sift snippet sets |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://cdn\.(?:sift\|siftscience)\.com/(?:s\|js/s-\d+)\.js(?:[?#]\|$)` | 100% | Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host |
| `^https://hexagon-analytics\.com/images/\d+\.gif\?` | 100% | Sift page-view beacon to hexagon-analytics.com (images/<n>.gif) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_sift\.push\(\s*\[\s*['\"]_setAccount['\"]` | 20% | Sift snippet account call in scripts (_sift.push(['_setAccount', ...])) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_sift (typeof object)` | 30% (corroboration only) | _sift command queue of the Sift snippet |
| `Sift (typeof string)` | 40% (corroboration only) | Sift global the Sift s.js sets once loaded |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Sift script or beacon with its runtime or cookie | 100% | (Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host or Sift page-view beacon to hexagon-analytics.com (images/<n>.gif)) and (_sift command queue of the Sift snippet or Sift global the Sift s.js sets once loaded or __ssid visitor cookie the Sift snippet sets) |
| Sift command queue with the loaded s.js | 80% | _sift command queue of the Sift snippet and Sift global the Sift s.js sets once loaded |
| __ssid cookie with the Sift runtime | 85% | __ssid visitor cookie the Sift snippet sets and (_sift command queue of the Sift snippet or Sift global the Sift s.js sets once loaded or Sift snippet account call in scripts (_sift.push(['_setAccount', ...]))) |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Sift is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Sift without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Sift with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
