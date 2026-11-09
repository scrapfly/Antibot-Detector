# Alibaba Cloud WAF bot protection: how to detect it (and what it means for scraping)

Alibaba Cloud WAF is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Alibaba Cloud WAF bypass, trying to detect Alibaba Cloud WAF on a site, or investigating web scraping blocked by Alibaba Cloud WAF, the first step is the same: confirm that Alibaba Cloud WAF is really what answers your requests. This page lists the 8 public signals that the Scrapfly Antibot Detector extension uses to recognise Alibaba Cloud WAF bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Alibaba Cloud WAF is the web application firewall of Alibaba Cloud. Besides filtering attacks it can serve JavaScript challenges to clients it does not trust, which is why it shows up in front of many Chinese and some global sites.

Official site: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## How to tell a site uses Alibaba Cloud WAF

These signals are generated from the extension's own detection rules for `detect-aliyunwaf` (rule version 2.1.0, last updated 2026-10-16). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (corroboration only) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (corroboration only) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (corroboration only) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (corroboration only) | Trace-id line of the Alibaba Cloud WAF block page |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie and Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) and Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie and (Alibaba Cloud WAF load-balancing session cookie or Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host and (Alibaba Cloud WAF JavaScript-challenge clearance cookie or Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) or Banner image of the Alibaba Cloud WAF 405 block page (English UI)) and Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie and Alibaba Cloud WAF load-balancing session cookie and Block-page help resources on the Aliyun Yundun errors host |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Alibaba Cloud WAF is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Alibaba Cloud WAF without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Alibaba Cloud WAF with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
