[English](../forter.md) | [Español](../es/forter.md) | [Русский](../ru/forter.md) | **简体中文** | [日本語](../ja/forter.md) | [Português (Brasil)](../pt-BR/forter.md) | [Deutsch](../de/forter.md) | [Français](../fr/forter.md) | [한국어](../ko/forter.md)

# Forter 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Forter 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Forter 绕过方法、想检测某个网站是否使用了 Forter，还是在排查网页抓取被 Forter 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Forter。本页列出 Scrapfly Antibot Detector 扩展用来识别 Forter 机器人检测的 7 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Forter 是面向在线商务的欺诈防范厂商。它的脚本会对浏览器进行指纹识别，网站则在结账和登录决策时一并发送由此得到的令牌。

官方网站: [https://www.forter.com/](https://www.forter.com/)

## 如何判断网站使用了 Forter

这些特征由扩展自身针对 `detect-forter` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^forterToken$` | 90% | forterToken cookie set by the Forter script |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://[0-9a-f]{12}\.cdn4\.forter\.com/sns?/[0-9a-f]{12}/(?:[^?#]*/)?script\.js(?:[?#]\|$)` | 100% | Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) |
| `^https://(?:[0-9a-f-]+\.)?cdn\d*\.forter\.com/(?:events\|[^?#]*\.json)(?:[?#]\|$)` | 100% | Forter collection request to a forter.com CDN host (prop.json, wpt.json, events) |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `\bftr__(?:startScriptLoad\|config)\b` | 20% (仅作佐证) | Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `ftr__config (typeof object)` | 60% | ftr__config object set by the Forter loader snippet |
| `ftr__startScriptLoad (typeof number)` | 50% (仅作佐证) | ftr__startScriptLoad timestamp set by the Forter loader snippet |
| `ftr__JSON3 (typeof object)` | 50% (仅作佐证) | ftr__JSON3 object set by the Forter script |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Forter script with its token cookie or config | 100% | (Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js)或Forter collection request to a forter.com CDN host (prop.json, wpt.json, events))和(forterToken cookie set by the Forter script或ftr__config object set by the Forter loader snippet) |
| forterToken cookie with the Forter runtime | 100% | forterToken cookie set by the Forter script和(ftr__config object set by the Forter loader snippet或ftr__startScriptLoad timestamp set by the Forter loader snippet或ftr__JSON3 object set by the Forter script或Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config)) |
| Forter loader globals together | 85% | ftr__config object set by the Forter loader snippet和(ftr__startScriptLoad timestamp set by the Forter loader snippet或ftr__JSON3 object set by the Forter script) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Forter，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Forter 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Forter，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
