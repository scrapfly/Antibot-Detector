[English](../seon.md) | [Español](../es/seon.md) | [Русский](../ru/seon.md) | **简体中文** | [日本語](../ja/seon.md) | [Português (Brasil)](../pt-BR/seon.md) | [Deutsch](../de/seon.md) | [Français](../fr/seon.md) | [한국어](../ko/seon.md)

# SEON 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

SEON 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 SEON 绕过方法、想检测某个网站是否使用了 SEON，还是在排查网页抓取被 SEON 拦截的问题，第一步都是一样的：确认响应你请求的确实是 SEON。本页列出 Scrapfly Antibot Detector 扩展用来识别 SEON 机器人检测的 7 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

SEON 是一家欺诈防范公司。它的 JavaScript 代理会收集设备和网络信号，用于风险评分。

官方网站: [https://seon.io/](https://seon.io/)

## 如何判断网站使用了 SEON

这些特征由扩展自身针对 `detect-seon` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://cdn\.(?:seondf\|dfsdk\|deviceinf\|seonintelligence)\.com/js/v\d+/agent(?:\.umd)?\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts |
| `^https://cdn\.seon\.io/js/v\d+/agent\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host |
| `^https://[0-9a-f]{16,64}\.seondnsresolve\.com/` | 100% | SEON agent network probe to a seondnsresolve.com host |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `\bseon\.(?:getSession\|getBase64Session\|config)\s*\(` | 20% (仅作佐证) | SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `seon.getSession (typeof function)` | 60% | seon.getSession function of the SEON v6 agent |
| `seon.getBase64Session (typeof function)` | 60% | seon.getBase64Session function of the SEON v5 agent |
| `webpackChunkseon_javascript_sdk (exists)` | 50% (仅作佐证) | webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| SEON agent from its host with its runtime | 100% | (SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts或SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host或SEON agent network probe to a seondnsresolve.com host)和(seon.getSession function of the SEON v6 agent或seon.getBase64Session function of the SEON v5 agent或webpackChunkseon_javascript_sdk global left by the SEON v5 agent) |
| SEON agent with its calls | 85% | (seon.getSession function of the SEON v6 agent或seon.getBase64Session function of the SEON v5 agent或webpackChunkseon_javascript_sdk global left by the SEON v5 agent)和SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |
| SEON v5 agent function with its runtime | 80% | seon.getBase64Session function of the SEON v5 agent和webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 SEON，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 SEON 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 SEON，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
