**English** | [Español](es/anubis.md) | [Русский](ru/anubis.md) | [简体中文](zh-CN/anubis.md) | [日本語](ja/anubis.md) | [Português (Brasil)](pt-BR/anubis.md) | [Deutsch](de/anubis.md) | [Français](fr/anubis.md) | [한국어](ko/anubis.md)

# Anubis bot protection: how to detect it (and what it means for scraping)

Anubis is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Anubis bypass, trying to detect Anubis on a site, or investigating web scraping blocked by Anubis, the first step is the same: confirm that Anubis is really what answers your requests. This page lists the 6 public signals that the Scrapfly Antibot Detector extension uses to recognise Anubis bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Anubis is an open-source web gate from Techaro that asks each new visitor's browser to solve a small proof-of-work puzzle before the page loads. It was created to slow down AI crawlers and is deployed by many open-source and community sites.

Official site: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## How to tell a site uses Anubis

These signals are generated from the extension's own detection rules for `detect-anubis` (rule version 2.1.1, last updated 2026-10-30). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (corroboration only) | Proof-of-work progress bar inner element on the challenge page |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint and (Anubis mascot image (pensive/happy/reject) loaded from the command endpoint or Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) or Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix)) and Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) and Anubis main challenge module loaded from the command endpoint and Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Anubis is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Anubis without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Anubis with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
