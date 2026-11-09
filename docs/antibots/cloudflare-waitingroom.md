# Cloudflare Waiting Room bot protection: how to detect it (and what it means for scraping)

Cloudflare Waiting Room is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Cloudflare Waiting Room bypass, trying to detect Cloudflare Waiting Room on a site, or investigating web scraping blocked by Cloudflare Waiting Room, the first step is the same: confirm that Cloudflare Waiting Room is really what answers your requests. This page lists the 3 public signals that the Scrapfly Antibot Detector extension uses to recognise Cloudflare Waiting Room bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Cloudflare Waiting Room is a Cloudflare feature that puts visitors in a queue when a site expects more traffic than its origin can handle. It is a traffic-control tool, not a bot detector, but the queue page still stops simple scrapers.

Official site: [https://developers.cloudflare.com/waiting-room/](https://developers.cloudflare.com/waiting-room/)

## How to tell a site uses Cloudflare Waiting Room

These signals are generated from the extension's own detection rules for `detect-cloudflare-waitingroom` (rule version 2.1.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^__cfwaitingroom$` | 100% | Waiting Room cookie that keeps the visitor's place in the queue |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^server$: ^cloudflare$` | 15% (corroboration only) | Served through Cloudflare; CDN delivery, not a queue on its own |
| `^cf-ray$: ^[0-9a-f]{12,20}-[A-Z]{3,4}$` | 15% (corroboration only) | Cloudflare request id header; present on any Cloudflare response |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Queue cookie on a Cloudflare response | 85% | Waiting Room cookie that keeps the visitor's place in the queue and Served through Cloudflare; CDN delivery, not a queue on its own |
| Queue cookie with a Cloudflare request id | 80% | Waiting Room cookie that keeps the visitor's place in the queue and Cloudflare request id header; present on any Cloudflare response |
| Queue cookie with Cloudflare server and request id | 100% | Waiting Room cookie that keeps the visitor's place in the queue and Served through Cloudflare; CDN delivery, not a queue on its own and Cloudflare request id header; present on any Cloudflare response |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Cloudflare Waiting Room is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Cloudflare Waiting Room without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Cloudflare Waiting Room with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
