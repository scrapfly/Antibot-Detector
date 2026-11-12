**English** | [Español](es/akamai.md) | [Русский](ru/akamai.md) | [简体中文](zh-CN/akamai.md) | [日本語](ja/akamai.md) | [Português (Brasil)](pt-BR/akamai.md) | [Deutsch](de/akamai.md) | [Français](fr/akamai.md) | [한국어](ko/akamai.md)

# Akamai Bot Manager bot protection: how to detect it (and what it means for scraping)

Akamai Bot Manager is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Akamai Bot Manager bypass, trying to detect Akamai Bot Manager on a site, or investigating web scraping blocked by Akamai Bot Manager, the first step is the same: confirm that Akamai Bot Manager is really what answers your requests. This page lists the 20 public signals that the Scrapfly Antibot Detector extension uses to recognise Akamai Bot Manager bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Akamai Bot Manager is the bot management product of Akamai Technologies, a CDN and security company. It is sold to large sites as part of Akamai's edge platform and aims to tell people, good bots and abusive automation apart.

Official site: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## How to tell a site uses Akamai Bot Manager

These signals are generated from the extension's own detection rules for `detect-akamai` (rule version 2.3.0, last updated 2026-11-12). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|s\|so\|lso)$` | 30% (corroboration only) | Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only |
| `^bm_sv$` | 60% | Bot Manager cookie bm_sv, named in Akamai's cookie documentation |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (corroboration only) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (corroboration only) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (corroboration only) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### Request and response payloads

Data the page sends to, or receives from, a matching address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape and (Bot Manager session cookie (hash~token) or Bot Manager edge session cookie or Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only or Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ or Bot Manager sensor object (bmak) or Bot Manager sensor_data POST body) and (Bot Manager sensor cookie in its documented hash~state~token shape or Bot Manager session cookie (hash~token) or Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script and Bot Manager sensor cookie in its documented hash~state~token shape and (Akamai edge server header; CDN delivery, not Bot Manager on its own or Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own or Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint or SBSD challenge POST to the sbsd endpoint) and SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own or Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) and (Bot Manager sensor cookie in its documented hash~state~token shape or Bot Manager session cookie (hash~token) or Bot Manager edge session cookie or Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie and (Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only or Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ and (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) or Bot Manager sensor cookie in its documented hash~state~token shape or Bot Manager session cookie (hash~token)) |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Akamai Bot Manager is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Akamai Bot Manager without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Akamai Bot Manager with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
