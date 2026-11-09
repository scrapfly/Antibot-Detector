# Fastly Bot Management bot protection: how to detect it (and what it means for scraping)

Fastly Bot Management is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Fastly Bot Management bypass, trying to detect Fastly Bot Management on a site, or investigating web scraping blocked by Fastly Bot Management, the first step is the same: confirm that Fastly Bot Management is really what answers your requests. This page lists the 6 public signals that the Scrapfly Antibot Detector extension uses to recognise Fastly Bot Management bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Fastly Bot Management is the bot detection product of Fastly, an edge cloud provider. It is delivered through Fastly's edge network and, per its detector, may also run client-side checks.

Official site: [https://www.fastly.com/products/bot-management](https://www.fastly.com/products/bot-management)

## How to tell a site uses Fastly Bot Management

These signals are generated from the extension's own detection rules for `detect-fastly` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^_fs_ch_st_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge start cookie (_fs_ch_st_<random>) |
| `^_fs_ch_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge complete cookie (_fs_ch_cp_<random>) |
| `^_fs_cd_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/challenge\.js(?:[?#]\|$)` | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/assets/[A-Za-z0-9_.-]{1,64}\.js(?:[?#]\|$)` | 100% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `div.fastly-challenge` | 40% | Embedded Fastly dynamic challenge container (div.fastly-challenge) |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Fastly challenge script with its cookie or container | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path and (Fastly challenge start cookie (_fs_ch_st_<random>) or Fastly challenge complete cookie (_fs_ch_cp_<random>) or Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly challenge complete cookie with its start cookie or container | 95% | Fastly challenge complete cookie (_fs_ch_cp_<random>) and (Fastly challenge start cookie (_fs_ch_st_<random>) or Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly detection script with its cookie | 95% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path and Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |
| Fastly challenge container with its start cookie | 90% | Embedded Fastly dynamic challenge container (div.fastly-challenge) and Fastly challenge start cookie (_fs_ch_st_<random>) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Fastly Bot Management is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Fastly Bot Management without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Fastly Bot Management with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
