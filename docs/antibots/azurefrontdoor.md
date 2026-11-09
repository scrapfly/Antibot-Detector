**English** | [Español](es/azurefrontdoor.md) | [Русский](ru/azurefrontdoor.md) | [简体中文](zh-CN/azurefrontdoor.md) | [日本語](ja/azurefrontdoor.md) | [Português (Brasil)](pt-BR/azurefrontdoor.md) | [Deutsch](de/azurefrontdoor.md) | [Français](fr/azurefrontdoor.md) | [한국어](ko/azurefrontdoor.md)

# Azure Front Door bot protection: how to detect it (and what it means for scraping)

Azure Front Door is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Azure Front Door bypass, trying to detect Azure Front Door on a site, or investigating web scraping blocked by Azure Front Door, the first step is the same: confirm that Azure Front Door is really what answers your requests. This page lists the 4 public signals that the Scrapfly Antibot Detector extension uses to recognise Azure Front Door bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Azure Front Door is Microsoft's global content delivery and application delivery service for Azure. It can be combined with Azure's web application firewall, so seeing it tells you about the edge in front of a site, not always that bots are filtered.

Official site: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## How to tell a site uses Azure Front Door

These signals are generated from the extension's own detection rules for `detect-azurefrontdoor` (rule version 2.1.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Response headers

HTTP response headers the page or its requests return.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (corroboration only) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response and Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response and Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host and (Azure Front Door request reference header on every edge response or Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response and Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) and Resource served from an azurefd.net Front Door endpoint host |

## Difficulty

**Low.** Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Azure Front Door is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Azure Front Door without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Azure Front Door with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
