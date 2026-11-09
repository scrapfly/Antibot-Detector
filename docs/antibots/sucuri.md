**English** | [Español](es/sucuri.md) | [Русский](ru/sucuri.md) | [简体中文](zh-CN/sucuri.md) | [日本語](ja/sucuri.md) | [Português (Brasil)](pt-BR/sucuri.md) | [Deutsch](de/sucuri.md) | [Français](fr/sucuri.md) | [한국어](ko/sucuri.md)

# Sucuri WAF bot protection: how to detect it (and what it means for scraping)

Sucuri WAF is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Sucuri WAF bypass, trying to detect Sucuri WAF on a site, or investigating web scraping blocked by Sucuri WAF, the first step is the same: confirm that Sucuri WAF is really what answers your requests. This page lists the 8 public signals that the Scrapfly Antibot Detector extension uses to recognise Sucuri WAF bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Sucuri is a website security company whose cloud WAF and CDN sit in front of a site to filter attacks and unwanted traffic.

Official site: [https://sucuri.net/](https://sucuri.net/)

## How to tell a site uses Sucuri WAF

These signals are generated from the extension's own detection rules for `detect-sucuri` (rule version 2.1.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (corroboration only) | Sucuri cache status header |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `Sucuri WebSite Firewall - Access Denied` | 30% (corroboration only) | Sucuri block page title |
| `Block ID:` | 20% (corroboration only) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title or Block ID label on the Sucuri block page) and (Sucuri WAF node id header or Sucuri block reason header or Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header and (Sucuri WAF node id header or Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable and (Sucuri CloudProxy JS-challenge cookie or Sucuri WAF node id header or Sucuri CloudProxy server header) |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Sucuri WAF is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Sucuri WAF without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Sucuri WAF with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
