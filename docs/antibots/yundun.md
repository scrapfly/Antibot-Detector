**English** | [Español](es/yundun.md) | [Русский](ru/yundun.md) | [简体中文](zh-CN/yundun.md) | [日本語](ja/yundun.md) | [Português (Brasil)](pt-BR/yundun.md) | [Deutsch](de/yundun.md) | [Français](fr/yundun.md) | [한국어](ko/yundun.md)

# Yundun Cloud WAF bot protection: how to detect it (and what it means for scraping)

Yundun Cloud WAF is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Yundun Cloud WAF bypass, trying to detect Yundun Cloud WAF on a site, or investigating web scraping blocked by Yundun Cloud WAF, the first step is the same: confirm that Yundun Cloud WAF is really what answers your requests. This page lists the 11 public signals that the Scrapfly Antibot Detector extension uses to recognise Yundun Cloud WAF bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Yundun is a Chinese cloud security provider offering a cloud WAF and anti-DDoS service. Its checks are commonly seen on Chinese websites.

Official site: [https://www.yundun.com/](https://www.yundun.com/)

## How to tell a site uses Yundun Cloud WAF

These signals are generated from the extension's own detection rules for `detect-yundun` (rule version 2.0.2, last updated 2026-10-29). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (corroboration only) | Yundun WAF session cookie |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (corroboration only) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (corroboration only) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (corroboration only) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges) and Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie and (Server header carrying the Yundun edge signature (legacy edges) or Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges) and Cache header carrying the Yundun edge signature (legacy edges) and Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge and X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) and Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) or First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)) and (Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) or Yundun WAF captcha marker cookie or Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) and Yundun WAF captcha marker cookie and Server: WAF sent by the current Yundun edge |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Yundun Cloud WAF is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Yundun Cloud WAF without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Yundun Cloud WAF with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
