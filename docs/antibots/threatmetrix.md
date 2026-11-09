# ThreatMetrix bot protection: how to detect it (and what it means for scraping)

ThreatMetrix is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a ThreatMetrix bypass, trying to detect ThreatMetrix on a site, or investigating web scraping blocked by ThreatMetrix, the first step is the same: confirm that ThreatMetrix is really what answers your requests. This page lists the 6 public signals that the Scrapfly Antibot Detector extension uses to recognise ThreatMetrix bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

ThreatMetrix is a device identification and fraud prevention service now owned by LexisNexis Risk Solutions. It profiles the visitor's device and sends the result to a decision engine.

Official site: [https://www.threatmetrix.com/](https://www.threatmetrix.com/)

## How to tell a site uses ThreatMetrix

These signals are generated from the extension's own detection rules for `detect-threatmetrix` (rule version 2.3.0, last updated 2026-10-17). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=` | 100% | ThreatMetrix profiling tag (fp/tags.js?org_id=...) |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/(?:check\.js\|clear\.png\|sym\.map\|ls_fp\.html)` | 100% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| `^https?://[^/?#]+/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=[A-Za-z0-9]{6,12}&(?:[^#]*&)?session_id=` | 50% (corroboration only) | First-party (CNAME) ThreatMetrix tag with org_id and session_id |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `tmx_(?:profiling_started\|run_page_fingerprinting)` | 10% | ThreatMetrix profiling globals in scripts |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `tmx_profiling_started (typeof boolean)` | 70% | ThreatMetrix profiling flag |
| `tmx_run_page_fingerprinting (typeof function)` | 60% | ThreatMetrix page fingerprint function |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Profiling tag with its runtime | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) or First-party (CNAME) ThreatMetrix tag with org_id and session_id) and (ThreatMetrix profiling flag or ThreatMetrix page fingerprint function or ThreatMetrix profiling globals in scripts) |
| Profiling tag with its follow-up resources | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) or First-party (CNAME) ThreatMetrix tag with org_id and session_id) and ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| Profiling resource with its runtime | 85% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) and (ThreatMetrix profiling flag or ThreatMetrix page fingerprint function) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If ThreatMetrix is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by ThreatMetrix without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists ThreatMetrix with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
