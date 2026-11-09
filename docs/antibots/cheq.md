**English** | [Español](es/cheq.md) | [Русский](ru/cheq.md) | [简体中文](zh-CN/cheq.md) | [日本語](ja/cheq.md) | [Português (Brasil)](pt-BR/cheq.md) | [Deutsch](de/cheq.md) | [Français](fr/cheq.md) | [한국어](ko/cheq.md)

# Cheq bot protection: how to detect it (and what it means for scraping)

Cheq is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Cheq bypass, trying to detect Cheq on a site, or investigating web scraping blocked by Cheq, the first step is the same: confirm that Cheq is really what answers your requests. This page lists the 12 public signals that the Scrapfly Antibot Detector extension uses to recognise Cheq bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

CHEQ is a go-to-market security company that sells bot, invalid-traffic and fraud prevention, mostly for advertising and marketing traffic.

Official site: [https://cheq.ai/](https://cheq.ai/)

## How to tell a site uses Cheq

These signals are generated from the extension's own detection rules for `detect-cheq` (rule version 2.2.0, last updated 2026-10-17). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (corroboration only) | Other CHEQ cookies |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (corroboration only) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (corroboration only) | CHEQ queue object (_cq) |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class or CHEQ tag with its JSONP callback attribute or CHEQ ClickTrue host (cheqzone.com)) and (CHEQ SDK global or CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie or Other CHEQ cookies) and (CHEQ queue object (_cq) or CHEQ JSONP callback name or CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host and (CHEQ visitor/session id cookie or Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai) and (CHEQ SDK global or CHEQ queue object (_cq) or CHEQ visitor/session id cookie or Other CHEQ cookies)) or ((ClickTrue tag; served from a disguised random host, identified by its class or CHEQ tag with its JSONP callback attribute or CHEQ ClickTrue host (cheqzone.com)) and (CHEQ queue object (_cq) or Other CHEQ cookies)) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Cheq is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Cheq without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Cheq with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
