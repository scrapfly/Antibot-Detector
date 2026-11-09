# FingerprintJS bot protection: how to detect it (and what it means for scraping)

FingerprintJS is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a FingerprintJS bypass, trying to detect FingerprintJS on a site, or investigating web scraping blocked by FingerprintJS, the first step is the same: confirm that FingerprintJS is really what answers your requests. This page lists the 13 public signals that the Scrapfly Antibot Detector extension uses to recognise FingerprintJS bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

FingerprintJS is a browser fingerprinting library, available as an open-source version and a commercial Pro service from Fingerprint. Its BotD library is a separate open-source bot detection tool. Finding it shows a site collects device signals, not necessarily that it blocks bots.

Official site: [https://fingerprint.com/](https://fingerprint.com/)

## How to tell a site uses FingerprintJS

These signals are generated from the extension's own detection rules for `detect-fingerprintjs` (rule version 2.3.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.){0,2}fpcdn\.io/v[34](?:[/?#]\|$)` | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host |
| `^https://openfpcdn\.io/fingerprintjs/v[0-9]+(?:[/?#]\|$)` | 100% | FingerprintJS open-source library on the vendor openfpcdn.io host |
| `^https://fpnpmcdn\.net/v[34]/[A-Za-z0-9]+/loader_v\d+\.\d+\.\d+\.js(?:[?#]\|$)` | 100% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net |
| `^https://(?:[a-z0-9-]+\.)?api\.fpjs\.(?:io\|sh\|pro)(?:[/?#]\|$)` | 100% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?ci=jsl?/[34]\.\d+\.\d+(?:[&#]\|$)` | 30% (corroboration only) | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter |
| `^https?://[^/?#]+/(?:[^?#]*/)?fp\.(?:esm\|umd\|cjs)(?:\.[A-Za-z0-9_-]{6,})?\.js(?:[?#]\|$)` | 50% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own |
| `^https://m1\.openfpcdn\.io/fingerprintjs/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | OSS npm package monitoring ping on the vendor m1.openfpcdn.io host |
| `^https?://[^/?#]+/fpjs/api(?:[/?#]\|$)` | 25% (corroboration only) | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS |
| `^https://openfpcdn\.io/botd/v[0-9]+(?:[/?#]\|$)` | 100% | BotD bot detection library on the vendor openfpcdn.io host (botd/v1, botd/v2) |
| `^https://m1\.openfpcdn\.io/botd/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | BotD npm package monitoring ping on the vendor m1.openfpcdn.io host |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `FingerprintJS` | 10% | Script reference to the FingerprintJS agent global |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `FingerprintJS (typeof object)` | 45% | FingerprintJS agent global object |
| `__fpjs_pvid (typeof string)` | 40% | Page-visit id the FingerprintJS Pro agent stores on window |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Pro agent loader with the agent global | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host and FingerprintJS agent global object |
| Open-source library with the agent global | 75% | FingerprintJS open-source library on the vendor openfpcdn.io host and FingerprintJS agent global object |
| First-party proxy endpoint with agent evidence | 85% | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS and (FingerprintJS agent global object or Script reference to the FingerprintJS agent global or Page-visit id the FingerprintJS Pro agent stores on window) |
| Bundled npm library with agent evidence | 75% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own and (FingerprintJS agent global object or Script reference to the FingerprintJS agent global or OSS npm package monitoring ping on the vendor m1.openfpcdn.io host) |
| Pro agent calling the vendor API with agent evidence | 85% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) and (FingerprintJS agent global object or Script reference to the FingerprintJS agent global or Page-visit id the FingerprintJS Pro agent stores on window) |
| npm Pro loader with calls to the vendor API | 85% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net and FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| CDN Pro loader with the agent's page-visit id | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host and Page-visit id the FingerprintJS Pro agent stores on window |
| First-party proxied Pro agent with its page-visit id | 80% | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter and Page-visit id the FingerprintJS Pro agent stores on window |
| Pro agent loader, agent global and script reference | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host and FingerprintJS agent global object and Script reference to the FingerprintJS agent global |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If FingerprintJS is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by FingerprintJS without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists FingerprintJS with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
