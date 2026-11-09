**English** | [Español](es/radware.md) | [Русский](ru/radware.md) | [简体中文](zh-CN/radware.md) | [日本語](ja/radware.md) | [Português (Brasil)](pt-BR/radware.md) | [Deutsch](de/radware.md) | [Français](fr/radware.md) | [한국어](ko/radware.md)

# Radware Bot Manager bot protection: how to detect it (and what it means for scraping)

Radware Bot Manager is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Radware Bot Manager bypass, trying to detect Radware Bot Manager on a site, or investigating web scraping blocked by Radware Bot Manager, the first step is the same: confirm that Radware Bot Manager is really what answers your requests. This page lists the 10 public signals that the Scrapfly Antibot Detector extension uses to recognise Radware Bot Manager bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Radware Bot Manager, formerly ShieldSquare, is the bot management product of Radware. Radware also sells a cloud WAF, and the detector looks for traces of both.

Official site: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## How to tell a site uses Radware Bot Manager

These signals are generated from the extension's own detection rules for `detect-radware` (rule version 2.2.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (corroboration only) | Radware Bot Manager cookies written by its JavaScript |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `CloudWebSec.radware.com` | 20% (corroboration only) | Script reference to the CloudWebSec vendor portal host |
| `Unauthorized Request Blocked` | 20% (corroboration only) | Script reference to the Radware block-page message |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | Script reference to the CloudWebSec vendor portal host and Script reference to the Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header and (Script reference to the CloudWebSec vendor portal host or Script reference to the Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header and Script reference to the CloudWebSec vendor portal host and Script reference to the Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) and First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) and First-party Radware Bot Manager script (stormcaster.js) and Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host and Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge and (Radware Bot Manager session cookies (__uzma … __uzmf) or Radware Bot Manager cookies written by its JavaScript) |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Radware Bot Manager is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Radware Bot Manager without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Radware Bot Manager with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
