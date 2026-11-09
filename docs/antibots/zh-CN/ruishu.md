[English](../ruishu.md) | [Español](../es/ruishu.md) | [Русский](../ru/ruishu.md) | **简体中文** | [日本語](../ja/ruishu.md) | [Português (Brasil)](../pt-BR/ruishu.md) | [Deutsch](../de/ruishu.md) | [Français](../fr/ruishu.md) | [한국어](../ko/ruishu.md)

# Ruishu 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Ruishu 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Ruishu 绕过方法、想检测某个网站是否使用了 Ruishu，还是在排查网页抓取被 Ruishu 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Ruishu。本页列出 Scrapfly Antibot Detector 扩展用来识别 Ruishu 机器人检测的 6 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

瑞数（Ruishu）是 River Security 推出的中国机器人防护产品。它通常会下发高度混淆的 JavaScript，在返回真实页面之前先设置动态 Cookie。

官方网站: [https://www.riversecurity.com/](https://www.riversecurity.com/)

## 如何判断网站使用了 Ruishu

这些特征由扩展自身针对 `detect-ruishu` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^FSSBBIl1UgzbN7N80[TS]$` | 100% | Ruishu static-cookie generator family (generation 4 name family) |
| `^waf_ci` | 45% (仅作佐证) | Ruishu WAF challenge-index cookie |
| `^[A-Za-z0-9]{12}[SO]$` | 30% (仅作佐证) | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page |
| `^[A-Za-z0-9]{12}[TP]$` | 30% (仅作佐证) | Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `$_ts (typeof object)` | 70% | Ruishu challenge state object defined by the obfuscated challenge script |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `script[r="m"]` | 60% | Ruishu challenge page: every script tag carries the r="m" marker attribute |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Challenge-page script marker with a Ruishu cookie | 90% | Ruishu challenge page: every script tag carries the r="m" marker attribute和(Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page或Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads或Ruishu static-cookie generator family (generation 4 name family)) |
| Challenge state object with a Ruishu cookie | 90% | Ruishu challenge state object defined by the obfuscated challenge script和(Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page或Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads或Ruishu static-cookie generator family (generation 4 name family)) |
| Server and client challenge cookies left after the challenge passed | 85% | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page和Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |
| Static-cookie family with the challenge-index cookie | 75% | Ruishu static-cookie generator family (generation 4 name family)和Ruishu WAF challenge-index cookie |
| Challenge state, script marker and a Ruishu cookie | 100% | Ruishu challenge state object defined by the obfuscated challenge script和Ruishu challenge page: every script tag carries the r="m" marker attribute和(Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page或Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads或Ruishu static-cookie generator family (generation 4 name family)) |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Ruishu，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Ruishu 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Ruishu，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
