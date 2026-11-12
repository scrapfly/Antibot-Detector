**English** | [Español](es/aws-waf.md) | [Русский](ru/aws-waf.md) | [简体中文](zh-CN/aws-waf.md) | [日本語](ja/aws-waf.md) | [Português (Brasil)](pt-BR/aws-waf.md) | [Deutsch](de/aws-waf.md) | [Français](fr/aws-waf.md) | [한국어](ko/aws-waf.md)

# AWS WAF bot protection: how to detect it (and what it means for scraping)

AWS WAF is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a AWS WAF bypass, trying to detect AWS WAF on a site, or investigating web scraping blocked by AWS WAF, the first step is the same: confirm that AWS WAF is really what answers your requests. This page lists the 14 public signals that the Scrapfly Antibot Detector extension uses to recognise AWS WAF bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

AWS WAF is Amazon Web Services' web application firewall. Its Bot Control and challenge features can require a browser to run a JavaScript challenge and keep a token, so a plain HTTP client may be turned away.

Official site: [https://aws.amazon.com/waf/](https://aws.amazon.com/waf/)

## How to tell a site uses AWS WAF

These signals are generated from the extension's own detection rules for `detect-aws-waf` (rule version 2.3.0, last updated 2026-11-12). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^aws-waf-token$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9+/=_:-]{20,}` | 100% | AWS WAF token cookie set after a challenge |
| `^aws-waf-token$` | 85% | AWS WAF token cookie by name; its value format is not documented |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-amzn-waf-action$: ^(?:challenge\|captcha)$` | 100% | AWS WAF challenge or captcha action header |
| `^x-amzn-waf-challenge-id$` | 40% (corroboration only) | AWS WAF challenge id header |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:challenge\|captcha\|jsapi)\.js(?:[?#]\|$)` | 100% | Integration SDK from the regional token.awswaf.com host |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:inputs\|verify\|telemetry\|voucher\|mp_verify)(?:[?#/]\|$)` | 100% | Any request to the regional token.awswaf.com host (inputs, verify, telemetry) |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.captcha\.awswaf\.com/` | 100% | AWS WAF CAPTCHA host |
| `^https://(?:[a-z0-9-]+\.)+awswaf\.com(?:[/?#:]\|$)` | 100% | Any request to an AWS WAF host (*.awswaf.com) |

### Page and script content

Text found inside the page or its scripts.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `gokuProps` | 15% (corroboration only) | Challenge page bootstrap variable (window.gokuProps) |
| `AwsWafIntegration` | 10% | Integration SDK namespace reference |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `AwsWafIntegration (typeof object)` | 75% | AWS WAF Integration SDK object |
| `gokuProps (typeof object)` | 70% | Challenge page bootstrap object (gokuProps) |
| `AwsWafCaptcha (typeof object)` | 75% | AWS WAF Integration SDK object |
| `awsWafCookieDomainList (exists)` | 30% (corroboration only) | Token cookie domain list for the Integration SDK |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Challenge response with its bootstrap | 100% | (AWS WAF challenge or captcha action header or AWS WAF challenge id header) and (Challenge page bootstrap object (gokuProps) or Challenge page bootstrap variable (window.gokuProps) or Integration SDK from the regional token.awswaf.com host) |
| Integration SDK with token traffic or cookie | 100% | (Integration SDK from the regional token.awswaf.com host or AWS WAF Integration SDK object) and (AWS WAF token cookie set after a challenge or Any request to the regional token.awswaf.com host (inputs, verify, telemetry) or Token cookie domain list for the Integration SDK) |
| Token cookie with SDK reference | 90% | (AWS WAF token cookie set after a challenge or AWS WAF token cookie by name; its value format is not documented) and (Integration SDK namespace reference or Challenge page bootstrap variable (window.gokuProps) or Token cookie domain list for the Integration SDK) |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If AWS WAF is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by AWS WAF without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists AWS WAF with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
