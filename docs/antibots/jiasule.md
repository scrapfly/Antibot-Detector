**English** | [Español](es/jiasule.md) | [Русский](ru/jiasule.md) | [简体中文](zh-CN/jiasule.md) | [日本語](ja/jiasule.md) | [Português (Brasil)](pt-BR/jiasule.md) | [Deutsch](de/jiasule.md) | [Français](fr/jiasule.md) | [한국어](ko/jiasule.md)

# Jiasule (Chuangyu Shield) bot protection: how to detect it (and what it means for scraping)

Jiasule (Chuangyu Shield) is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Jiasule (Chuangyu Shield) bypass, trying to detect Jiasule (Chuangyu Shield) on a site, or investigating web scraping blocked by Jiasule (Chuangyu Shield), the first step is the same: confirm that Jiasule (Chuangyu Shield) is really what answers your requests. This page lists the 7 public signals that the Scrapfly Antibot Detector extension uses to recognise Jiasule (Chuangyu Shield) bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Jiasule, also written Chuangyu Shield, is an anti-DDoS and web protection service from Knownsec in China. It often presents a JavaScript gate before a page loads.

Official site: [https://www.jiasule.com/](https://www.jiasule.com/)

## How to tell a site uses Jiasule (Chuangyu Shield)

These signals are generated from the extension's own detection rules for `detect-jiasule` (rule version 2.2.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (corroboration only) | Jiasule tracking cookie set alongside the challenge cookies |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie and Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response or Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) and (Jiasule visitor id cookie set on first request or Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response and Jiasule visitor id cookie set on first request and Jiasule JavaScript-challenge clearance cookie |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Jiasule (Chuangyu Shield) is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Jiasule (Chuangyu Shield) without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Jiasule (Chuangyu Shield) with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
