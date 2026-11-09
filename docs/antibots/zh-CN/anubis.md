[English](../anubis.md) | [Español](../es/anubis.md) | [Русский](../ru/anubis.md) | **简体中文** | [日本語](../ja/anubis.md) | [Português (Brasil)](../pt-BR/anubis.md) | [Deutsch](../de/anubis.md) | [Français](../fr/anubis.md) | [한국어](../ko/anubis.md)

# Anubis 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Anubis 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Anubis 绕过方法、想检测某个网站是否使用了 Anubis，还是在排查网页抓取被 Anubis 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Anubis。本页列出 Scrapfly Antibot Detector 扩展用来识别 Anubis 机器人检测的 6 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Anubis 是 Techaro 推出的开源 Web 网关，会要求每位新访客的浏览器在页面加载前先解出一个小型工作量证明（proof-of-work）难题。它最初是为了减缓 AI 爬虫而创建的，许多开源和社区网站都部署了它。

官方网站: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## 如何判断网站使用了 Anubis

这些特征由扩展自身针对 `detect-anubis` 的检测规则生成（规则版本 2.1.1，最后更新于 2026-10-30）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (仅作佐证) | Proof-of-work progress bar inner element on the challenge page |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint和(Anubis mascot image (pensive/happy/reject) loaded from the command endpoint或Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name)或Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix))和Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name)和Anubis main challenge module loaded from the command endpoint和Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Anubis，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Anubis 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Anubis，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
