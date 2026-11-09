# Cloudflare Bot Management bot protection: how to detect it (and what it means for scraping)

Cloudflare Bot Management is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Cloudflare Bot Management bypass, trying to detect Cloudflare Bot Management on a site, or investigating web scraping blocked by Cloudflare Bot Management, the first step is the same: confirm that Cloudflare Bot Management is really what answers your requests. This page lists the 11 public signals that the Scrapfly Antibot Detector extension uses to recognise Cloudflare Bot Management bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Cloudflare Bot Management is Cloudflare's paid bot detection product, delivered from its global network. Cloudflare also runs free challenge pages, so a Cloudflare challenge does not by itself mean the paid product is enabled.

Official site: [https://www.cloudflare.com/products/bot-management/](https://www.cloudflare.com/products/bot-management/)

## How to tell a site uses Cloudflare Bot Management

These signals are generated from the extension's own detection rules for `detect-cloudflare` (rule version 2.3.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^cf_clearance$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Challenge clearance cookie, set after passing a Cloudflare challenge |
| `^__cf_bm$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}\.[0-9]{5,8}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode |
| `^cf_chl_rc_(?:i\|ni\|m)$` | 85% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^cf-mitigated$: ^challenge$` | 100% | Response header Cloudflare sends when it served a challenge page |
| `^server$: ^cloudflare$` | 15% (corroboration only) | Served through Cloudflare; CDN delivery, not bot management on its own |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?orchestrate/(?:chl_page\|managed\|jsch\|captcha)/` | 100% | Challenge page orchestrator under /cdn-cgi/challenge-platform/ |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?scripts/jsd/(?:[0-9a-f]{6,20}/)?main\.js(?:[?#]\|$)` | 100% | Bot Management JavaScript detections script |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?jsd/oneshot/` | 100% | Bot Management JavaScript detections report (/cdn-cgi/challenge-platform/…/jsd/oneshot/) |
| `^https://challenges\.cloudflare\.com/` | 40% (corroboration only) | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_cf_chl_opt` | 20% | Script reference to the _cf_chl_opt challenge options object |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_cf_chl_opt (typeof object)` | 85% | Challenge options object present on a Cloudflare challenge page |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Challenge page orchestrator and challenge options object | 100% | (Challenge page orchestrator under /cdn-cgi/challenge-platform/ or Response header Cloudflare sends when it served a challenge page) and (Challenge options object present on a Cloudflare challenge page or Script reference to the _cf_chl_opt challenge options object) |
| Clearance cookie with Bot Management cookie | 85% | Challenge clearance cookie, set after passing a Cloudflare challenge and (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode or Served through Cloudflare; CDN delivery, not bot management on its own) |
| Bot Management script on a Cloudflare zone | 75% | Bot Management JavaScript detections script and (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode or Served through Cloudflare; CDN delivery, not bot management on its own) |
| Challenge host request on a Cloudflare zone with a challenge signal | 90% | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only and (Challenge clearance cookie, set after passing a Cloudflare challenge or Challenge options object present on a Cloudflare challenge page or Challenge page orchestrator under /cdn-cgi/challenge-platform/) |
| Challenge platform cookie with a Cloudflare clearance, server header or challenge | 95% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) and (Challenge clearance cookie, set after passing a Cloudflare challenge or Served through Cloudflare; CDN delivery, not bot management on its own or Challenge page orchestrator under /cdn-cgi/challenge-platform/ or Challenge options object present on a Cloudflare challenge page) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Cloudflare Bot Management is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Cloudflare Bot Management without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Cloudflare Bot Management with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
