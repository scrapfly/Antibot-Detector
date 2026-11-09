**English** | [Español](es/netacea.md) | [Русский](ru/netacea.md) | [简体中文](zh-CN/netacea.md) | [日本語](ja/netacea.md) | [Português (Brasil)](pt-BR/netacea.md) | [Deutsch](de/netacea.md) | [Français](fr/netacea.md) | [한국어](ko/netacea.md)

# Netacea bot protection: how to detect it (and what it means for scraping)

Netacea is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Netacea bypass, trying to detect Netacea on a site, or investigating web scraping blocked by Netacea, the first step is the same: confirm that Netacea is really what answers your requests. This page lists the 3 public signals that the Scrapfly Antibot Detector extension uses to recognise Netacea bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Netacea is a bot management vendor that works without a page script on every request, reading traffic at the edge or the server instead. Its cookies are the usual visible trace, and their names can be changed per customer.

Official site: [https://www.netacea.com/](https://www.netacea.com/)

## How to tell a site uses Netacea

These signals are generated from the extension's own detection rules for `detect-netacea` (rule version 2.2.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^_mitata$` | 60% | Netacea mitigation cookie, in the browser or set by the server (default name) |
| `^_mitatacaptcha$` | 100% | Netacea captcha-serving cookie (default name) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/AtaVerifyCaptcha(?:[?#]\|$)` | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Captcha cookie with a mitigation cookie | 100% | Netacea captcha-serving cookie (default name) and Netacea mitigation cookie, in the browser or set by the server (default name) |
| Captcha verification with a Netacea cookie | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) and Netacea captcha-serving cookie (default name) |
| Captcha verification with the mitigation cookie | 95% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) and Netacea mitigation cookie, in the browser or set by the server (default name) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Netacea is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Netacea without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Netacea with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
