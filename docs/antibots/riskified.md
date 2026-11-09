**English** | [Español](es/riskified.md) | [Русский](ru/riskified.md) | [简体中文](zh-CN/riskified.md) | [日本語](ja/riskified.md) | [Português (Brasil)](pt-BR/riskified.md) | [Deutsch](de/riskified.md) | [Français](fr/riskified.md) | [한국어](ko/riskified.md)

# Riskified bot protection: how to detect it (and what it means for scraping)

Riskified is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Riskified bypass, trying to detect Riskified on a site, or investigating web scraping blocked by Riskified, the first step is the same: confirm that Riskified is really what answers your requests. This page lists the 4 public signals that the Scrapfly Antibot Detector extension uses to recognise Riskified bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Riskified is an e-commerce fraud prevention company. A script on storefronts sends browser and session data that supports its payment and account abuse decisions.

Official site: [https://www.riskified.com/](https://www.riskified.com/)

## How to tell a site uses Riskified

These signals are generated from the extension's own detection rules for `detect-riskified` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://beacon\.riskified\.com/?\?(?:[^#]*&)?shop=[^&#]+` | 100% | Riskified beacon script from the vendor beacon.riskified.com host (shop=<store>&sid=<session>) |
| `^https://(?:c\.riskified\.com/e\.gif\|img\.riskified\.com/img/)` | 100% | Riskified beacon request to its c.riskified.com or img.riskified.com collector |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `RISKX.go (typeof function)` | 60% | RISKX.go function of the Riskified beacon |
| `RISKX.setSid (typeof function)` | 40% (corroboration only) | RISKX.setSid session helper of the Riskified beacon |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Riskified beacon with its global or collector | 100% | Riskified beacon script from the vendor beacon.riskified.com host (shop=<store>&sid=<session>) and (RISKX.go function of the Riskified beacon or RISKX.setSid session helper of the Riskified beacon or Riskified beacon request to its c.riskified.com or img.riskified.com collector) |
| Riskified collector request with its global | 95% | Riskified beacon request to its c.riskified.com or img.riskified.com collector and (RISKX.go function of the Riskified beacon or RISKX.setSid session helper of the Riskified beacon) |
| Riskified global with its session helper | 80% | RISKX.go function of the Riskified beacon and RISKX.setSid session helper of the Riskified beacon |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Riskified is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Riskified without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Riskified with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
