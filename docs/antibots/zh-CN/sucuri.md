[English](../sucuri.md) | [Español](../es/sucuri.md) | [Русский](../ru/sucuri.md) | **简体中文** | [日本語](../ja/sucuri.md) | [Português (Brasil)](../pt-BR/sucuri.md) | [Deutsch](../de/sucuri.md) | [Français](../fr/sucuri.md) | [한국어](../ko/sucuri.md)

# Sucuri WAF 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Sucuri WAF 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Sucuri WAF 绕过方法、想检测某个网站是否使用了 Sucuri WAF，还是在排查网页抓取被 Sucuri WAF 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Sucuri WAF。本页列出 Scrapfly Antibot Detector 扩展用来识别 Sucuri WAF 机器人检测的 8 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Sucuri 是一家网站安全公司，其云 WAF 和 CDN 位于网站前面，用于过滤攻击和不需要的流量。

官方网站: [https://sucuri.net/](https://sucuri.net/)

## 如何判断网站使用了 Sucuri WAF

这些特征由扩展自身针对 `detect-sucuri` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-11-12）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (仅作佐证) | Sucuri cache status header |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `Sucuri Web ?Site Firewall - (?:CloudProxy - )?Access Denied\|Access Denied - Sucuri Web ?Site Firewall` | 30% (仅作佐证) | Sucuri block page title |
| `Block ID:` | 20% (仅作佐证) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title或Block ID label on the Sucuri block page)和(Sucuri WAF node id header或Sucuri block reason header或Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header和(Sucuri WAF node id header或Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable和(Sucuri CloudProxy JS-challenge cookie或Sucuri WAF node id header或Sucuri CloudProxy server header) |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Sucuri WAF，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Sucuri WAF 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Sucuri WAF，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
