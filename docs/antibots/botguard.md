# Google BotGuard bot protection: how to detect it (and what it means for scraping)

Google BotGuard is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Google BotGuard bypass, trying to detect Google BotGuard on a site, or investigating web scraping blocked by Google BotGuard, the first step is the same: confirm that Google BotGuard is really what answers your requests. This page lists the 7 public signals that the Scrapfly Antibot Detector extension uses to recognise Google BotGuard bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

BotGuard is Google's own client-side integrity and bot detection technology. It is used by Google services and by reCAPTCHA, and Google does not publish how it works.

Official site: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## How to tell a site uses Google BotGuard

These signals are generated from the extension's own detection rules for `detect-botguard` (rule version 2.3.0, last updated 2026-10-17). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (corroboration only) | BotGuard interpreter URL key |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `trayride (exists)` | 50% (corroboration only) | BotGuard VM global (globalName from bgChallenge) |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) or BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) and (Web Anti-Abuse (BotGuard) attestation RPC or Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) or BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) and (BotGuard challenge config key in page data or BotGuard interpreter URL key or BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC or Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) and (BotGuard VM global (globalName from bgChallenge) or BotGuard challenge config key in page data) |

## Difficulty

**High.** High means the extension rates this protection as among the hardest to get past: it typically combines client-side checks with behavioural or server-side scoring.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Google BotGuard is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Google BotGuard without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Google BotGuard with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
