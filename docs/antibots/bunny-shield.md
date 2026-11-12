**English** | [Español](es/bunny-shield.md) | [Русский](ru/bunny-shield.md) | [简体中文](zh-CN/bunny-shield.md) | [日本語](ja/bunny-shield.md) | [Português (Brasil)](pt-BR/bunny-shield.md) | [Deutsch](de/bunny-shield.md) | [Français](fr/bunny-shield.md) | [한국어](ko/bunny-shield.md)

# Bunny Shield bot protection: how to detect it (and what it means for scraping)

Bunny Shield is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Bunny Shield bypass, trying to detect Bunny Shield on a site, or investigating web scraping blocked by Bunny Shield, the first step is the same: confirm that Bunny Shield is really what answers your requests. This page lists the 5 public signals that the Scrapfly Antibot Detector extension uses to recognise Bunny Shield bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Bunny Shield is the edge security product of bunny.net, a CDN company. It adds a web application firewall, rate limiting and bot detection to bunny.net sites, and can ask browsers to solve a JavaScript proof-of-work challenge.

Official site: [https://bunny.net/shield/](https://bunny.net/shield/)

## How to tell a site uses Bunny Shield

These signals are generated from the extension's own detection rules for `detect-bunny-shield` (rule version 2.0.0, last updated 2026-11-12). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^bunny_shield$` | 90% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) |
| `^bunny_shield_chk$` | 90% | bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| `^bunny_shield_id$` | 90% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) |
| `^bunny_shield_bd$` | 90% | bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^server$: ^BunnyCDN-[A-Z0-9]{2,6}-[0-9]{1,8}$` | 40% (corroboration only) | Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Proof-of-work cookie with its checksum | 100% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) and bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| Bot detection identifier and fingerprint cookies | 95% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) and bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |
| Bunny Shield cookie on a bunny.net edge response | 95% | (bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) or bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) or bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) or bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs)) and Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Bunny Shield is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Bunny Shield without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Bunny Shield with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
