**English** | [Español](es/ddosguard.md) | [Русский](ru/ddosguard.md) | [简体中文](zh-CN/ddosguard.md) | [日本語](ja/ddosguard.md) | [Português (Brasil)](pt-BR/ddosguard.md) | [Deutsch](de/ddosguard.md) | [Français](fr/ddosguard.md) | [한국어](ko/ddosguard.md)

# DDoS-Guard bot protection: how to detect it (and what it means for scraping)

DDoS-Guard is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a DDoS-Guard bypass, trying to detect DDoS-Guard on a site, or investigating web scraping blocked by DDoS-Guard, the first step is the same: confirm that DDoS-Guard is really what answers your requests. This page lists the 4 public signals that the Scrapfly Antibot Detector extension uses to recognise DDoS-Guard bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

DDoS-Guard is a hosting and DDoS-protection provider that works as a reverse proxy. It can show a browser check to visitors it wants to verify.

Official site: [https://ddos-guard.net/](https://ddos-guard.net/)

## How to tell a site uses DDoS-Guard

These signals are generated from the extension's own detection rules for `detect-ddosguard` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^__ddg(?:[0-9]{1,2}\|id\|mark)_$` | 100% | DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^server$: ^ddos-guard$` | 100% | DDoS-Guard server header |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/ddos-guard/(?:check\|js-challenge/\|id/)` | 100% | DDoS-Guard check scripts under /.well-known/ddos-guard/ |
| `^https?://check\.ddos-guard\.net/` | 100% | Request to check.ddos-guard.net |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| DDoS-Guard server with its cookies | 100% | DDoS-Guard server header and DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |
| Browser check script on a DDoS-Guard response | 100% | (DDoS-Guard check scripts under /.well-known/ddos-guard/ or Request to check.ddos-guard.net) and (DDoS-Guard server header or DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies)) |
| Check scripts on the site and on check.ddos-guard.net | 95% | DDoS-Guard check scripts under /.well-known/ddos-guard/ and Request to check.ddos-guard.net |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If DDoS-Guard is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by DDoS-Guard without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists DDoS-Guard with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
