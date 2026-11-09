**English** | [Español](es/vercel.md) | [Русский](ru/vercel.md) | [简体中文](zh-CN/vercel.md) | [日本語](ja/vercel.md) | [Português (Brasil)](pt-BR/vercel.md) | [Deutsch](de/vercel.md) | [Français](fr/vercel.md) | [한국어](ko/vercel.md)

# Vercel Firewall bot protection: how to detect it (and what it means for scraping)

Vercel Firewall is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Vercel Firewall bypass, trying to detect Vercel Firewall on a site, or investigating web scraping blocked by Vercel Firewall, the first step is the same: confirm that Vercel Firewall is really what answers your requests. This page lists the 9 public signals that the Scrapfly Antibot Detector extension uses to recognise Vercel Firewall bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Vercel Firewall is the security layer of the Vercel hosting platform. It includes configurable rules, an Attack Mode challenge page and a BotID check.

Official site: [https://vercel.com/docs/vercel-firewall](https://vercel.com/docs/vercel-firewall)

## How to tell a site uses Vercel Firewall

These signals are generated from the extension's own detection rules for `detect-vercel` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-vercel-mitigated$: ^challenge$` | 100% | x-vercel-mitigated: challenge, the Vercel Firewall served its challenge |
| `^x-vercel-mitigated$: ^deny$` | 100% | x-vercel-mitigated: deny, the Vercel Firewall blocked the request |
| `^x-vercel-challenge-(?:token\|solution\|version)$` | 60% | x-vercel-challenge-token header of the Vercel Security Checkpoint |
| `^server$: ^Vercel$` | 15% (corroboration only) | Hosted on Vercel; hosting, not bot protection on its own |
| `^x-vercel-id$` | 15% (corroboration only) | Vercel request id header; present on any Vercel response |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/vercel/security/static/challenge(?:\.v[0-9]+)?(?:\.min)?\.js(?:[?#]\|$)` | 90% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ |
| `^https?://[^/?#]+/\.well-known/vercel/security/request-challenge(?:[?#]\|$)` | 50% (corroboration only) | Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge |
| `^https?://[^/?#]+/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/(?:a-4-a/c\|p)\.js(?:[?#]\|$)` | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3` | 30% | BotID path written in the page's scripts |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Vercel Security Checkpoint on a Vercel response | 100% | (x-vercel-mitigated: challenge, the Vercel Firewall served its challenge or x-vercel-mitigated: deny, the Vercel Firewall blocked the request or Vercel Security Checkpoint script under /.well-known/vercel/security/static/) and (Hosted on Vercel; hosting, not bot protection on its own or Vercel request id header; present on any Vercel response) |
| BotID script with its path in the page's scripts | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) and BotID path written in the page's scripts |
| Checkpoint script with its answer request or token | 95% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ and (Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge or x-vercel-challenge-token header of the Vercel Security Checkpoint) |
| Checkpoint token or answer request on a Vercel response | 85% | (x-vercel-challenge-token header of the Vercel Security Checkpoint or Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge) and (Hosted on Vercel; hosting, not bot protection on its own or Vercel request id header; present on any Vercel response) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Vercel Firewall is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Vercel Firewall without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Vercel Firewall with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
