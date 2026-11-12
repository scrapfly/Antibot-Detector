[English](../edgeone.md) | [Español](../es/edgeone.md) | [Русский](../ru/edgeone.md) | **简体中文** | [日本語](../ja/edgeone.md) | [Português (Brasil)](../pt-BR/edgeone.md) | [Deutsch](../de/edgeone.md) | [Français](../fr/edgeone.md) | [한국어](../ko/edgeone.md)

# Tencent Cloud EdgeOne 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Tencent Cloud EdgeOne 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Tencent Cloud EdgeOne 绕过方法、想检测某个网站是否使用了 Tencent Cloud EdgeOne，还是在排查网页抓取被 Tencent Cloud EdgeOne 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Tencent Cloud EdgeOne。本页列出 Scrapfly Antibot Detector 扩展用来识别 Tencent Cloud EdgeOne 机器人检测的 8 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Tencent Cloud EdgeOne 是腾讯云的边缘加速与安全平台。除内容分发外，它还提供 WAF 和 Bot 管理，可以下发 JavaScript 挑战，并用客户端认证 SDK 校验客户端。

官方网站: [https://edgeone.ai/](https://edgeone.ai/)

## 如何判断网站使用了 Tencent Cloud EdgeOne

这些特征由扩展自身针对 `detect-edgeone` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-11-12）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^EO-Bot-SessionId$` | 90% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) |
| `^EO-Bot-Token$` | 90% | EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| `^EO_Bot_Ssid$` | 60% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^eo-log-uuid$: ^[0-9]{10,24}$` | 40% (仅作佐证) | EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection |
| `^server$: ^TencentEdgeOne$` | 40% (仅作佐证) | Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://cdnstatic\.tencentcs\.com/edgeone/security/client-attestation/eoclientsecuritykit(?:\.min)?\.js(?:[?#]\|$)` | 100% | EdgeOne client attestation SDK eoclientsecuritykit.min.js on Tencent's CDN (EdgeOne docs) |
| `^https?://[^/?#]+/\.eo-sec-bot/` | 100% | Request to /.eo-sec-bot/ on the site, which the EdgeOne attestation SDK calls to start (EdgeOne docs) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `EOClientSecurityKit (typeof object)` | 75% | EOClientSecurityKit object of the EdgeOne client attestation SDK |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Bot session cookie and client verification token | 100% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs)和EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| Bot management cookie on an EdgeOne response | 95% | (EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs)或EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs))和(EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection或Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| JavaScript challenge cookie on an EdgeOne response | 90% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs和(EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection或Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| Attestation SDK object on an EdgeOne response | 90% | EOClientSecurityKit object of the EdgeOne client attestation SDK和(EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection或Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Tencent Cloud EdgeOne，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Tencent Cloud EdgeOne 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Tencent Cloud EdgeOne，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
