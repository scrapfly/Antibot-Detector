[English](../incapsula.md) | [Español](../es/incapsula.md) | [Русский](../ru/incapsula.md) | **简体中文** | [日本語](../ja/incapsula.md) | [Português (Brasil)](../pt-BR/incapsula.md) | [Deutsch](../de/incapsula.md) | [Français](../fr/incapsula.md) | [한국어](../ko/incapsula.md)

# Incapsula (Imperva) 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Incapsula (Imperva) 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Incapsula (Imperva) 绕过方法、想检测某个网站是否使用了 Incapsula (Imperva)，还是在排查网页抓取被 Incapsula (Imperva) 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Incapsula (Imperva)。本页列出 Scrapfly Antibot Detector 扩展用来识别 Incapsula (Imperva) 机器人检测的 10 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Incapsula 是 Imperva 云 Web 应用防火墙和 CDN 的旧名称。它把 WAF 规则与机器人防护结合在一起，通常可以通过其 Cookie 识别。

官方网站: [https://www.imperva.com/products/web-application-firewall-waf/](https://www.imperva.com/products/web-application-firewall-waf/)

## 如何判断网站使用了 Incapsula (Imperva)

这些特征由扩展自身针对 `detect-incapsula` 的检测规则生成（规则版本 2.1.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^incap_ses_[0-9]+_[0-9]+$` | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) |
| `^visid_incap_[0-9]+$` | 100% | Incapsula visitor ID cookie (visid_incap_<site>) |
| `^nlbi_[0-9]+(?:_[0-9]+)?$` | 60% | Incapsula load balancer cookie (nlbi_<site>) |
| `^reese84$` | 100% | Imperva Advanced Bot Protection token cookie |
| `^___utmvc$` | 100% | Incapsula JavaScript challenge cookie (___utmvc) |
| `^_impv_routing$` | 40% (仅作佐证) | Imperva edge routing cookie (seen with incap_ses_ / visid_incap_) |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-iinfo$` | 100% | Incapsula request info response header |
| `^x-cdn$: ^(?:Imperva\|Incapsula)$` | 100% | Imperva CDN response header |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/_Incapsula_Resource\?` | 100% | Incapsula challenge resource endpoint |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `_Incapsula_Resource` | 20% | Script reference to _Incapsula_Resource or the incident page |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Incapsula session and visitor cookies | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>)和(Incapsula visitor ID cookie (visid_incap_<site>)或Incapsula load balancer cookie (nlbi_<site>)或Imperva edge routing cookie (seen with incap_ses_ / visid_incap_)) |
| Imperva edge header with an Incapsula cookie | 100% | (Incapsula request info response header或Imperva CDN response header)和(Incapsula session cookie (incap_ses_<proxy>_<site>)或Incapsula visitor ID cookie (visid_incap_<site>)或Incapsula load balancer cookie (nlbi_<site>)或Imperva Advanced Bot Protection token cookie) |
| Incapsula challenge resource with a challenge cookie | 90% | Incapsula challenge resource endpoint和(Incapsula JavaScript challenge cookie (___utmvc)或Imperva Advanced Bot Protection token cookie或Incapsula session cookie (incap_ses_<proxy>_<site>)) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Incapsula (Imperva)，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Incapsula (Imperva) 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Incapsula (Imperva)，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
