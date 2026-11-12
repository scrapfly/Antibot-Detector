**English** | [Español](es/edgeone.md) | [Русский](ru/edgeone.md) | [简体中文](zh-CN/edgeone.md) | [日本語](ja/edgeone.md) | [Português (Brasil)](pt-BR/edgeone.md) | [Deutsch](de/edgeone.md) | [Français](fr/edgeone.md) | [한국어](ko/edgeone.md)

# Tencent Cloud EdgeOne bot protection: how to detect it (and what it means for scraping)

Tencent Cloud EdgeOne is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Tencent Cloud EdgeOne bypass, trying to detect Tencent Cloud EdgeOne on a site, or investigating web scraping blocked by Tencent Cloud EdgeOne, the first step is the same: confirm that Tencent Cloud EdgeOne is really what answers your requests. This page lists the 8 public signals that the Scrapfly Antibot Detector extension uses to recognise Tencent Cloud EdgeOne bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Tencent Cloud EdgeOne is Tencent Cloud's edge acceleration and security platform. Besides content delivery it offers a WAF and bot management that can serve JavaScript challenges and check clients with an attestation SDK.

Official site: [https://edgeone.ai/](https://edgeone.ai/)

## How to tell a site uses Tencent Cloud EdgeOne

These signals are generated from the extension's own detection rules for `detect-edgeone` (rule version 2.0.0, last updated 2026-11-12). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^EO-Bot-SessionId$` | 90% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) |
| `^EO-Bot-Token$` | 90% | EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| `^EO_Bot_Ssid$` | 60% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^eo-log-uuid$: ^[0-9]{10,24}$` | 40% (corroboration only) | EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection |
| `^server$: ^TencentEdgeOne$` | 40% (corroboration only) | Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://cdnstatic\.tencentcs\.com/edgeone/security/client-attestation/eoclientsecuritykit(?:\.min)?\.js(?:[?#]\|$)` | 100% | EdgeOne client attestation SDK eoclientsecuritykit.min.js on Tencent's CDN (EdgeOne docs) |
| `^https?://[^/?#]+/\.eo-sec-bot/` | 100% | Request to /.eo-sec-bot/ on the site, which the EdgeOne attestation SDK calls to start (EdgeOne docs) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `EOClientSecurityKit (typeof object)` | 75% | EOClientSecurityKit object of the EdgeOne client attestation SDK |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Bot session cookie and client verification token | 100% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) and EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| Bot management cookie on an EdgeOne response | 95% | (EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) or EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs)) and (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection or Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| JavaScript challenge cookie on an EdgeOne response | 90% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs and (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection or Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| Attestation SDK object on an EdgeOne response | 90% | EOClientSecurityKit object of the EdgeOne client attestation SDK and (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection or Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Tencent Cloud EdgeOne is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Tencent Cloud EdgeOne without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Tencent Cloud EdgeOne with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
