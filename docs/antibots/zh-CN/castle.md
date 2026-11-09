[English](../castle.md) | [Español](../es/castle.md) | [Русский](../ru/castle.md) | **简体中文** | [日本語](../ja/castle.md) | [Português (Brasil)](../pt-BR/castle.md) | [Deutsch](../de/castle.md) | [Français](../fr/castle.md) | [한국어](../ko/castle.md)

# Castle 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Castle 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Castle 绕过方法、想检测某个网站是否使用了 Castle，还是在排查网页抓取被 Castle 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Castle。本页列出 Scrapfly Antibot Detector 扩展用来识别 Castle 机器人检测的 6 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Castle 是一家提供账户接管、机器人和滥用防护的安全厂商。它的浏览器脚本会生成请求令牌，网站在登录和敏感操作时将该令牌连同请求一起发送到 Castle 的 API。

官方网站: [https://castle.io/](https://castle.io/)

## 如何判断网站使用了 Castle

这些特征由扩展自身针对 `detect-castle` 的检测规则生成（规则版本 2.0.1，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^__cuid$` | 30% | __cuid device cookie Castle.js stores by default |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://cdn\.castle\.io/v2/castle\.js(?:[?#]\|$)` | 100% | Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) |
| `^https://m\.castle\.io/v1/monitor(?:[/?#]\|$)` | 100% | Castle.js event request to the vendor m.castle.io monitor endpoint |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `Castle.createRequestToken (typeof function)` | 60% | Castle.createRequestToken function of the Castle.js global |
| `Castle.injectTokenOnSubmit (typeof function)` | 50% (仅作佐证) | Castle.injectTokenOnSubmit form helper of the Castle.js global |
| `_castle (typeof function)` | 30% (仅作佐证) | _castle function set by the CDN castle.js |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Castle.js from its host with its cookie or global | 100% | (Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js)或Castle.js event request to the vendor m.castle.io monitor endpoint)和(__cuid device cookie Castle.js stores by default或Castle.createRequestToken function of the Castle.js global或_castle function set by the CDN castle.js) |
| __cuid cookie with Castle.js | 90% | __cuid device cookie Castle.js stores by default和(Castle.createRequestToken function of the Castle.js global或Castle.injectTokenOnSubmit form helper of the Castle.js global或_castle function set by the CDN castle.js或Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js)或Castle.js event request to the vendor m.castle.io monitor endpoint) |
| Castle.js global with its helpers | 80% | Castle.createRequestToken function of the Castle.js global和Castle.injectTokenOnSubmit form helper of the Castle.js global |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Castle，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Castle 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Castle，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
