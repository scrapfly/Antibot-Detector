**English** | [Español](es/seon.md) | [Русский](ru/seon.md) | [简体中文](zh-CN/seon.md) | [日本語](ja/seon.md) | [Português (Brasil)](pt-BR/seon.md) | [Deutsch](de/seon.md) | [Français](fr/seon.md) | [한국어](ko/seon.md)

# SEON bot protection: how to detect it (and what it means for scraping)

SEON is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a SEON bypass, trying to detect SEON on a site, or investigating web scraping blocked by SEON, the first step is the same: confirm that SEON is really what answers your requests. This page lists the 7 public signals that the Scrapfly Antibot Detector extension uses to recognise SEON bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

SEON is a fraud prevention company. Its JavaScript agent gathers device and network signals that feed its risk scoring.

Official site: [https://seon.io/](https://seon.io/)

## How to tell a site uses SEON

These signals are generated from the extension's own detection rules for `detect-seon` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://cdn\.(?:seondf\|dfsdk\|deviceinf\|seonintelligence)\.com/js/v\d+/agent(?:\.umd)?\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts |
| `^https://cdn\.seon\.io/js/v\d+/agent\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host |
| `^https://[0-9a-f]{16,64}\.seondnsresolve\.com/` | 100% | SEON agent network probe to a seondnsresolve.com host |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `\bseon\.(?:getSession\|getBase64Session\|config)\s*\(` | 20% (corroboration only) | SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `seon.getSession (typeof function)` | 60% | seon.getSession function of the SEON v6 agent |
| `seon.getBase64Session (typeof function)` | 60% | seon.getBase64Session function of the SEON v5 agent |
| `webpackChunkseon_javascript_sdk (exists)` | 50% (corroboration only) | webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| SEON agent from its host with its runtime | 100% | (SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts or SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host or SEON agent network probe to a seondnsresolve.com host) and (seon.getSession function of the SEON v6 agent or seon.getBase64Session function of the SEON v5 agent or webpackChunkseon_javascript_sdk global left by the SEON v5 agent) |
| SEON agent with its calls | 85% | (seon.getSession function of the SEON v6 agent or seon.getBase64Session function of the SEON v5 agent or webpackChunkseon_javascript_sdk global left by the SEON v5 agent) and SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |
| SEON v5 agent function with its runtime | 80% | seon.getBase64Session function of the SEON v5 agent and webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If SEON is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by SEON without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists SEON with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
