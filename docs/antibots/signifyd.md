**English** | [Español](es/signifyd.md) | [Русский](ru/signifyd.md) | [简体中文](zh-CN/signifyd.md) | [日本語](ja/signifyd.md) | [Português (Brasil)](pt-BR/signifyd.md) | [Deutsch](de/signifyd.md) | [Français](fr/signifyd.md) | [한국어](ko/signifyd.md)

# Signifyd bot protection: how to detect it (and what it means for scraping)

Signifyd is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Signifyd bypass, trying to detect Signifyd on a site, or investigating web scraping blocked by Signifyd, the first step is the same: confirm that Signifyd is really what answers your requests. This page lists the 9 public signals that the Scrapfly Antibot Detector extension uses to recognise Signifyd bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Signifyd is a commerce fraud protection platform used by online stores. Its device profiling script collects device and browser data on the shop's pages so that Signifyd can score orders for fraud risk.

Official site: [https://www.signifyd.com/](https://www.signifyd.com/)

## How to tell a site uses Signifyd

These signals are generated from the extension's own detection rules for `detect-signifyd` (rule version 2.0.0, last updated 2026-11-12). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://cdn-scripts\.signifyd\.com/(?:api\|bigcommerce\|shopify)/script-tag\.js(?:[?#]\|$)` | 100% | Signifyd device profiling script script-tag.js on cdn-scripts.signifyd.com (standard, BigCommerce or Shopify) |
| `^https://cdn-scripts\.signifyd\.com/(?:api/company_toolkit\|o/(?:loader\|lite)\|bigcommerce/conversion-tracking)\.js(?:[?#]\|$)` | 100% | Other Signifyd scripts on cdn-scripts.signifyd.com (company_toolkit.js, loader.js, lite.js, BigCommerce conversion-tracking.js) |
| `^https://dp\.signifyd\.com/fp-web(?:[?#]\|$)` | 100% | Device profile sent to dp.signifyd.com/fp-web |
| `^https?://[^/?#]+/api/script-tag\.js(?:[?#]\|$)` | 40% (corroboration only) | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only |
| `^https?://[^/?#]+/o/lite\.js(?:[?#]\|$)` | 30% (corroboration only) | First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only |
| `^https?://[^/?#]+/fp-web(?:[?#]\|$)` | 30% (corroboration only) | First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `signifyd.pageView (typeof function)` | 60% | signifyd.pageView method the Signifyd script exposes for single-page applications |
| `sigScriptLoader (typeof object)` | 60% | sigScriptLoader object of the Signifyd script, with its isInitialized flag |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `script#script-tag-api[data-order-session-id], script#sig-api[data-order-session-id], script#sig-bc[data-store-id]` | 60% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Signifyd script tag served from the site with its profiling routes | 100% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute and First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only and (First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only or First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only) |
| Signifyd script tag with its runtime | 95% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute and (signifyd.pageView method the Signifyd script exposes for single-page applications or sigScriptLoader object of the Signifyd script, with its isInitialized flag) |
| All three Signifyd routes served from the site | 85% | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only and First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only and First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |
| Signifyd loader and page-view method | 85% | signifyd.pageView method the Signifyd script exposes for single-page applications and sigScriptLoader object of the Signifyd script, with its isInitialized flag |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Signifyd is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Signifyd without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Signifyd with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
