**English** | [Español](es/reblaze.md) | [Русский](ru/reblaze.md) | [简体中文](zh-CN/reblaze.md) | [日本語](ja/reblaze.md) | [Português (Brasil)](pt-BR/reblaze.md) | [Deutsch](de/reblaze.md) | [Français](fr/reblaze.md) | [한국어](ko/reblaze.md)

# Reblaze bot protection: how to detect it (and what it means for scraping)

Reblaze is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Reblaze bypass, trying to detect Reblaze on a site, or investigating web scraping blocked by Reblaze, the first step is the same: confirm that Reblaze is really what answers your requests. This page lists the 7 public signals that the Scrapfly Antibot Detector extension uses to recognise Reblaze bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Reblaze is a cloud web security platform that includes a web application firewall, DDoS protection and bot management.

Official site: [https://www.reblaze.com/](https://www.reblaze.com/)

## How to tell a site uses Reblaze

These signals are generated from the extension's own detection rules for `detect-reblaze` (rule version 2.1.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^rbzid$` | 80% | Reblaze visitor id cookie |
| `^rbzsessionid$` | 100% | Reblaze session cookie |
| `^rbz(?!id$\|sessionid$)[a-z0-9_]{2,20}$` | 30% (corroboration only) | Other rbz* cookies (not rbzid or rbzsessionid) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9_-]{3,40}\.ac_v2\.lib\.js(?:[?#]\|$)` | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `rbzns` | 10% | Reblaze namespace in page scripts |
| `bereshit` | 20% (corroboration only) | Reblaze challenge config key (rbzns.bereshit) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `rbzns (typeof object)` | 75% | Reblaze namespace object (window.rbzns) |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Challenge library with its namespace | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) and (Reblaze namespace object (window.rbzns) or Reblaze namespace in page scripts or Reblaze challenge config key (rbzns.bereshit)) |
| Reblaze cookies with its namespace or library | 90% | (Reblaze visitor id cookie or Reblaze session cookie or Other rbz* cookies (not rbzid or rbzsessionid)) and (Reblaze namespace object (window.rbzns) or Reblaze active-challenge library (<name>.ac_v2.lib.js) or Reblaze namespace in page scripts) |
| Reblaze id and session cookies | 85% | Reblaze visitor id cookie and (Reblaze session cookie or Other rbz* cookies (not rbzid or rbzsessionid)) |
| Reblaze namespace running with its challenge config | 90% | Reblaze namespace object (window.rbzns) and Reblaze challenge config key (rbzns.bereshit) |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Reblaze is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Reblaze without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Reblaze with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
