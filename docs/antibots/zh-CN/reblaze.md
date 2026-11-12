[English](../reblaze.md) | [Español](../es/reblaze.md) | [Русский](../ru/reblaze.md) | **简体中文** | [日本語](../ja/reblaze.md) | [Português (Brasil)](../pt-BR/reblaze.md) | [Deutsch](../de/reblaze.md) | [Français](../fr/reblaze.md) | [한국어](../ko/reblaze.md)

# Reblaze 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Reblaze 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Reblaze 绕过方法、想检测某个网站是否使用了 Reblaze，还是在排查网页抓取被 Reblaze 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Reblaze。本页列出 Scrapfly Antibot Detector 扩展用来识别 Reblaze 机器人检测的 8 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Reblaze 是一个云 Web 安全平台，包含 Web 应用防火墙、DDoS 防护和机器人管理。

官方网站: [https://www.reblaze.com/](https://www.reblaze.com/)

## 如何判断网站使用了 Reblaze

这些特征由扩展自身针对 `detect-reblaze` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-11-12）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^rbzid$` | 80% | Reblaze visitor id cookie |
| `^rbzsessionid$` | 100% | Reblaze session cookie |
| `^rbz(?!id$\|sessionid$)[a-z0-9_]{2,20}$` | 30% (仅作佐证) | Other rbz* cookies (not rbzid or rbzsessionid) |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9_-]{3,40}\.ac_v2\.lib\.js(?:[?#]\|$)` | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) |
| `^https?://[^/?#]+/c3650cdf-216a-4ba2-80b0-9d6c540b105e58d2670b-ea0f-484e-b88c-0e2c1499ec9bd71e4b42-8570-44e3-89b6-845326fa43b6(?:[?#]\|$)` | 100% | Reblaze passive challenge script at its fixed first-party path |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `rbzns` | 10% | Reblaze namespace in page scripts |
| `bereshit` | 20% (仅作佐证) | Reblaze challenge config key (rbzns.bereshit) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `rbzns (typeof object)` | 75% | Reblaze namespace object (window.rbzns) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Challenge library with its namespace | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js)和(Reblaze namespace object (window.rbzns)或Reblaze namespace in page scripts或Reblaze challenge config key (rbzns.bereshit)) |
| Reblaze cookies with its namespace or library | 90% | (Reblaze visitor id cookie或Reblaze session cookie或Other rbz* cookies (not rbzid or rbzsessionid))和(Reblaze namespace object (window.rbzns)或Reblaze active-challenge library (<name>.ac_v2.lib.js)或Reblaze namespace in page scripts) |
| Reblaze id and session cookies | 85% | Reblaze visitor id cookie和(Reblaze session cookie或Other rbz* cookies (not rbzid or rbzsessionid)) |
| Reblaze namespace running with its challenge config | 90% | Reblaze namespace object (window.rbzns)和Reblaze challenge config key (rbzns.bereshit) |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Reblaze，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Reblaze 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Reblaze，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
