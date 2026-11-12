**English** | [Español](es/cloud-armor.md) | [Русский](ru/cloud-armor.md) | [简体中文](zh-CN/cloud-armor.md) | [日本語](ja/cloud-armor.md) | [Português (Brasil)](pt-BR/cloud-armor.md) | [Deutsch](de/cloud-armor.md) | [Français](fr/cloud-armor.md) | [한국어](ko/cloud-armor.md)

# Google Cloud Armor bot protection: how to detect it (and what it means for scraping)

Google Cloud Armor is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Google Cloud Armor bypass, trying to detect Google Cloud Armor on a site, or investigating web scraping blocked by Google Cloud Armor, the first step is the same: confirm that Google Cloud Armor is really what answers your requests. This page lists the 3 public signals that the Scrapfly Antibot Detector extension uses to recognise Google Cloud Armor bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Google Cloud Armor is the WAF and DDoS protection service in front of Google Cloud load balancers. Its bot management uses reCAPTCHA to challenge visitors and to check the tokens reCAPTCHA leaves in their browser.

Official site: [https://cloud.google.com/security/products/armor](https://cloud.google.com/security/products/armor)

## How to tell a site uses Google Cloud Armor

These signals are generated from the extension's own detection rules for `detect-cloud-armor` (rule version 2.0.0, last updated 2026-11-12). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^recaptcha-ca-e$` | 90% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) |
| `^recaptcha-ca-t$` | 70% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://www\.(?:google\.com\|recaptcha\.net)/recaptcha/(?:api\|enterprise)\.js\?(?:[^#]*&)?waf=session(?:[&#]\|$)` | 50% (corroboration only) | reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Exemption cookie and session-token cookie | 100% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) and recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |
| Session-token cookie with the reCAPTCHA script that sets it | 85% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) and reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |
| Exemption cookie with a reCAPTCHA for WAF session-token script | 95% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) and reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Google Cloud Armor is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Google Cloud Armor without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Google Cloud Armor with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
