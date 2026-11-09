[English](../shapesecurity.md) | [Español](../es/shapesecurity.md) | [Русский](../ru/shapesecurity.md) | **简体中文** | [日本語](../ja/shapesecurity.md) | [Português (Brasil)](../pt-BR/shapesecurity.md) | [Deutsch](../de/shapesecurity.md) | [Français](../fr/shapesecurity.md) | [한국어](../ko/shapesecurity.md)

# Shape Security 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Shape Security 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Shape Security 绕过方法、想检测某个网站是否使用了 Shape Security，还是在排查网页抓取被 Shape Security 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Shape Security。本页列出 Scrapfly Antibot Detector 扩展用来识别 Shape Security 机器人检测的 5 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Shape Security 已被 F5 收购，打造了企业级机器人防御，针对登录和结账流程中的欺诈、撞库和自动化行为。

官方网站: [https://www.shapesecurity.com/products/bot-manager](https://www.shapesecurity.com/products/bot-manager)

## 如何判断网站使用了 Shape Security

这些特征由扩展自身针对 `detect-shapesecurity` 的检测规则生成（规则版本 2.1.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?seed=[A-Za-z0-9_-]{40,}` | 85% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{0,60}/ssx\.mod\.js(?:\?async)?(?:#\|$)` | 60% (仅作佐证) | Shape ssx.mod.js loader (Target, Nordstrom) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?X-[A-Za-z0-9]{6,10}--z=q(?:&\|#\|$)` | 50% (仅作佐证) | Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `__xr_bmobdb` | 10% | Shape runtime global reference |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `__xr_bmobdb (exists)` | 80% | Shape runtime global (__xr_bmobdb) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Seeded loader with its runtime | 100% | Shape loader with its long seed parameter (ssx.mod.js?seed=...)和(Shape runtime global (__xr_bmobdb)或Shape runtime global reference或Shape seeded-script marker parameter (X-xxxxxxxx--z=q)) |
| ssx.mod.js loader with the Shape runtime | 90% | Shape ssx.mod.js loader (Target, Nordstrom)和(Shape runtime global (__xr_bmobdb)或Shape loader with its long seed parameter (ssx.mod.js?seed=...)) |
| ssx.mod.js loader with the seeded-script marker | 80% | Shape ssx.mod.js loader (Target, Nordstrom)和Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

## 难度

**高.** 高表示扩展将这种防护评为最难绕过的类型之一：它通常把客户端检查与行为分析或服务端评分结合在一起。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Shape Security，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Shape Security 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Shape Security，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
