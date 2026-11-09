# SiteGround SG-CAPTCHA bot protection: how to detect it (and what it means for scraping)

SiteGround SG-CAPTCHA is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a SiteGround SG-CAPTCHA bypass, trying to detect SiteGround SG-CAPTCHA on a site, or investigating web scraping blocked by SiteGround SG-CAPTCHA, the first step is the same: confirm that SiteGround SG-CAPTCHA is really what answers your requests. This page lists the 3 public signals that the Scrapfly Antibot Detector extension uses to recognise SiteGround SG-CAPTCHA bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

SG-CAPTCHA is the anti-bot challenge used by SiteGround hosting. Visitors that look automated are sent to a challenge page that must be passed before the site loads.

Official site: [https://www.siteground.com/blog/new-anti-bot-ai/](https://www.siteground.com/blog/new-anti-bot-ai/)

## How to tell a site uses SiteGround SG-CAPTCHA

These signals are generated from the extension's own detection rules for `detect-siteground-captcha` (rule version 2.0.0, last updated 2026-11-05). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^sg-captcha$: ^challenge$` | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/sgcaptcha/(?:[?#]\|$)` | 100% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `\bsg(?:challenge\|submit_url)\b` | 30% | SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| sg-captcha header on the SG-CAPTCHA challenge page | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge and SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |
| sg-captcha header with the challenge constants in the page's scripts | 95% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge and SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |
| SG-CAPTCHA challenge page with its constants in the page's scripts | 90% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ and SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If SiteGround SG-CAPTCHA is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by SiteGround SG-CAPTCHA without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists SiteGround SG-CAPTCHA with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
