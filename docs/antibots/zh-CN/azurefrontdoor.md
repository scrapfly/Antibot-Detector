[English](../azurefrontdoor.md) | [Español](../es/azurefrontdoor.md) | [Русский](../ru/azurefrontdoor.md) | **简体中文** | [日本語](../ja/azurefrontdoor.md) | [Português (Brasil)](../pt-BR/azurefrontdoor.md) | [Deutsch](../de/azurefrontdoor.md) | [Français](../fr/azurefrontdoor.md) | [한국어](../ko/azurefrontdoor.md)

# Azure Front Door 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Azure Front Door 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Azure Front Door 绕过方法、想检测某个网站是否使用了 Azure Front Door，还是在排查网页抓取被 Azure Front Door 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Azure Front Door。本页列出 Scrapfly Antibot Detector 扩展用来识别 Azure Front Door 机器人检测的 4 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Azure Front Door 是微软面向 Azure 的全球内容分发和应用分发服务。它可以与 Azure 的 Web 应用防火墙配合使用，因此看到它只说明网站前面有这一层边缘服务，并不一定意味着会过滤机器人。

官方网站: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## 如何判断网站使用了 Azure Front Door

这些特征由扩展自身针对 `detect-azurefrontdoor` 的检测规则生成（规则版本 2.1.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (仅作佐证) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response和Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response和Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host和(Azure Front Door request reference header on every edge response或Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response和Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)和Resource served from an azurefd.net Front Door endpoint host |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Azure Front Door，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Azure Front Door 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Azure Front Door，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
