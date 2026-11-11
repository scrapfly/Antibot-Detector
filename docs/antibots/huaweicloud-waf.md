**English** | [Español](es/huaweicloud-waf.md) | [Русский](ru/huaweicloud-waf.md) | [简体中文](zh-CN/huaweicloud-waf.md) | [日本語](ja/huaweicloud-waf.md) | [Português (Brasil)](pt-BR/huaweicloud-waf.md) | [Deutsch](de/huaweicloud-waf.md) | [Français](fr/huaweicloud-waf.md) | [한국어](ko/huaweicloud-waf.md)

# Huawei Cloud WAF bot protection: how to detect it (and what it means for scraping)

Huawei Cloud WAF is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Huawei Cloud WAF bypass, trying to detect Huawei Cloud WAF on a site, or investigating web scraping blocked by Huawei Cloud WAF, the first step is the same: confirm that Huawei Cloud WAF is really what answers your requests. This page lists the 3 public signals that the Scrapfly Antibot Detector extension uses to recognise Huawei Cloud WAF bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Huawei Cloud WAF is the web application firewall of Huawei Cloud. On a connected site it adds session cookies to visitors' requests, which its CC attack protection and anti-crawler rules use to count and track requests.

Official site: [https://www.huaweicloud.com/intl/en-us/product/waf.html](https://www.huaweicloud.com/intl/en-us/product/waf.html)

## How to tell a site uses Huawei Cloud WAF

These signals are generated from the extension's own detection rules for `detect-huaweicloud-waf` (rule version 2.0.0, last updated 2026-11-11). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^HWWAFSESID$` | 90% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| `^HWWAFSESTIME$` | 90% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^server$: HuaweiCloudWAF` | 40% (corroboration only) | Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Both WAF session cookies | 100% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) and HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| Session ID cookie with the WAF server header | 95% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) and Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |
| Session timestamp cookie with the WAF server header | 95% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) and Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Huawei Cloud WAF is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Huawei Cloud WAF without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Huawei Cloud WAF with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
