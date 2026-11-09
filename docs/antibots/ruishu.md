# Ruishu bot protection: how to detect it (and what it means for scraping)

Ruishu is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Ruishu bypass, trying to detect Ruishu on a site, or investigating web scraping blocked by Ruishu, the first step is the same: confirm that Ruishu is really what answers your requests. This page lists the 6 public signals that the Scrapfly Antibot Detector extension uses to recognise Ruishu bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Ruishu is a Chinese bot protection product from River Security. It typically delivers heavily obfuscated JavaScript that sets dynamic cookies before the real page is served.

Official site: [https://www.riversecurity.com/](https://www.riversecurity.com/)

## How to tell a site uses Ruishu

These signals are generated from the extension's own detection rules for `detect-ruishu` (rule version 2.2.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^FSSBBIl1UgzbN7N80[TS]$` | 100% | Ruishu static-cookie generator family (generation 4 name family) |
| `^waf_ci` | 45% (corroboration only) | Ruishu WAF challenge-index cookie |
| `^[A-Za-z0-9]{12}[SO]$` | 30% (corroboration only) | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page |
| `^[A-Za-z0-9]{12}[TP]$` | 30% (corroboration only) | Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `$_ts (typeof object)` | 70% | Ruishu challenge state object defined by the obfuscated challenge script |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `script[r="m"]` | 60% | Ruishu challenge page: every script tag carries the r="m" marker attribute |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Challenge-page script marker with a Ruishu cookie | 90% | Ruishu challenge page: every script tag carries the r="m" marker attribute and (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page or Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads or Ruishu static-cookie generator family (generation 4 name family)) |
| Challenge state object with a Ruishu cookie | 90% | Ruishu challenge state object defined by the obfuscated challenge script and (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page or Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads or Ruishu static-cookie generator family (generation 4 name family)) |
| Server and client challenge cookies left after the challenge passed | 85% | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page and Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |
| Static-cookie family with the challenge-index cookie | 75% | Ruishu static-cookie generator family (generation 4 name family) and Ruishu WAF challenge-index cookie |
| Challenge state, script marker and a Ruishu cookie | 100% | Ruishu challenge state object defined by the obfuscated challenge script and Ruishu challenge page: every script tag carries the r="m" marker attribute and (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page or Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads or Ruishu static-cookie generator family (generation 4 name family)) |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Ruishu is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Ruishu without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Ruishu with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
