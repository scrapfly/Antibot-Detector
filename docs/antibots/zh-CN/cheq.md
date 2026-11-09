[English](../cheq.md) | [Español](../es/cheq.md) | [Русский](../ru/cheq.md) | **简体中文** | [日本語](../ja/cheq.md) | [Português (Brasil)](../pt-BR/cheq.md) | [Deutsch](../de/cheq.md) | [Français](../fr/cheq.md) | [한국어](../ko/cheq.md)

# Cheq 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Cheq 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Cheq 绕过方法、想检测某个网站是否使用了 Cheq，还是在排查网页抓取被 Cheq 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Cheq。本页列出 Scrapfly Antibot Detector 扩展用来识别 Cheq 机器人检测的 12 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

CHEQ 是一家 go-to-market 安全公司，提供机器人、无效流量和欺诈防范服务，主要面向广告和营销流量。

官方网站: [https://cheq.ai/](https://cheq.ai/)

## 如何判断网站使用了 Cheq

这些特征由扩展自身针对 `detect-cheq` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-10-17）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (仅作佐证) | Other CHEQ cookies |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (仅作佐证) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (仅作佐证) | CHEQ queue object (_cq) |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class或CHEQ tag with its JSONP callback attribute或CHEQ ClickTrue host (cheqzone.com))和(CHEQ SDK global或CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie或Other CHEQ cookies)和(CHEQ queue object (_cq)或CHEQ JSONP callback name或CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host和(CHEQ visitor/session id cookie或Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai)和(CHEQ SDK global或CHEQ queue object (_cq)或CHEQ visitor/session id cookie或Other CHEQ cookies))或((ClickTrue tag; served from a disguised random host, identified by its class或CHEQ tag with its JSONP callback attribute或CHEQ ClickTrue host (cheqzone.com))和(CHEQ queue object (_cq)或Other CHEQ cookies)) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Cheq，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Cheq 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Cheq，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
