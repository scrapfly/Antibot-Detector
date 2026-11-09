**English** | [Español](es/amazon.md) | [Русский](ru/amazon.md) | [简体中文](zh-CN/amazon.md) | [日本語](ja/amazon.md) | [Português (Brasil)](pt-BR/amazon.md) | [Deutsch](de/amazon.md) | [Français](fr/amazon.md) | [한국어](ko/amazon.md)

# Amazon Bot Protection bot protection: how to detect it (and what it means for scraping)

Amazon Bot Protection is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Amazon Bot Protection bypass, trying to detect Amazon Bot Protection on a site, or investigating web scraping blocked by Amazon Bot Protection, the first step is the same: confirm that Amazon Bot Protection is really what answers your requests. This page lists the 3 public signals that the Scrapfly Antibot Detector extension uses to recognise Amazon Bot Protection bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Amazon's sign-in pages collect a client-side browser fingerprint that the login form submits with the credentials. It is part of Amazon's own anti-abuse tooling rather than a product other sites can buy.

Official site: [https://www.amazon.com/](https://www.amazon.com/)

## How to tell a site uses Amazon Bot Protection

These signals are generated from the extension's own detection rules for `detect-amazon` (rule version 2.1.1, last updated 2026-11-04). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `fwcimCmd` | 30% (corroboration only) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (corroboration only) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint and FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint and Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages and Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## Difficulty

**High.** High means the extension rates this protection as among the hardest to get past: it typically combines client-side checks with behavioural or server-side scoring.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Amazon Bot Protection is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Amazon Bot Protection without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Amazon Bot Protection with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
