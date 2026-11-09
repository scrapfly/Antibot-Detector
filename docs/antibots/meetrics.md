**English** | [Español](es/meetrics.md) | [Русский](ru/meetrics.md) | [简体中文](zh-CN/meetrics.md) | [日本語](ja/meetrics.md) | [Português (Brasil)](pt-BR/meetrics.md) | [Deutsch](de/meetrics.md) | [Français](fr/meetrics.md) | [한국어](ko/meetrics.md)

# Meetrics Check bot protection: how to detect it (and what it means for scraping)

Meetrics Check is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Meetrics Check bypass, trying to detect Meetrics Check on a site, or investigating web scraping blocked by Meetrics Check, the first step is the same: confirm that Meetrics Check is really what answers your requests. This page lists the 4 public signals that the Scrapfly Antibot Detector extension uses to recognise Meetrics Check bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Meetrics is a media measurement company that has offered ad viewability and ad-fraud measurement tags. The detector flags older integrations that still reference its script, which may no longer work.

Official site: [https://www.meetrics.com/en/](https://www.meetrics.com/en/)

## How to tell a site uses Meetrics Check

These signals are generated from the extension's own detection rules for `detect-meetrics` (rule version 2.1.0, last updated 2026-10-17). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}mxcdn\.net/bb-mx/serve/mtrcs_[0-9]+\.js(?:[?#]\|$)` | 40% | Legacy Meetrics tag (mxcdn.net, now parked) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}meetrics\.(?:com\|net)/` | 20% (corroboration only) | Legacy meetrics.com/.net host |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `meetricsGlobal` | 5% | Meetrics global reference in scripts |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `meetricsGlobal (typeof object)` | 40% | Meetrics global object |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Legacy tag with its runtime | 60% | Legacy Meetrics tag (mxcdn.net, now parked) and Meetrics global object |
| Meetrics host traffic with its runtime | 50% | Legacy meetrics.com/.net host and (Meetrics global object or Meetrics global reference in scripts) |
| Legacy tag referenced in page scripts | 45% | Legacy Meetrics tag (mxcdn.net, now parked) and Meetrics global reference in scripts |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Meetrics Check is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Meetrics Check without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Meetrics Check with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
