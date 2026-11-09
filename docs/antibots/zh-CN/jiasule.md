[English](../jiasule.md) | [Español](../es/jiasule.md) | [Русский](../ru/jiasule.md) | **简体中文** | [日本語](../ja/jiasule.md) | [Português (Brasil)](../pt-BR/jiasule.md) | [Deutsch](../de/jiasule.md) | [Français](../fr/jiasule.md) | [한국어](../ko/jiasule.md)

# Jiasule (Chuangyu Shield) 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Jiasule (Chuangyu Shield) 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Jiasule (Chuangyu Shield) 绕过方法、想检测某个网站是否使用了 Jiasule (Chuangyu Shield)，还是在排查网页抓取被 Jiasule (Chuangyu Shield) 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Jiasule (Chuangyu Shield)。本页列出 Scrapfly Antibot Detector 扩展用来识别 Jiasule (Chuangyu Shield) 机器人检测的 7 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

加速乐（Jiasule），也写作创宇盾，是中国知道创宇（Knownsec）提供的抗 DDoS 与网站防护服务。它经常在页面加载前先显示一道 JavaScript 门槛。

官方网站: [https://www.jiasule.com/](https://www.jiasule.com/)

## 如何判断网站使用了 Jiasule (Chuangyu Shield)

这些特征由扩展自身针对 `detect-jiasule` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (仅作佐证) | Jiasule tracking cookie set alongside the challenge cookies |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie和Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response或Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server))和(Jiasule visitor id cookie set on first request或Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response和Jiasule visitor id cookie set on first request和Jiasule JavaScript-challenge clearance cookie |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Jiasule (Chuangyu Shield)，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Jiasule (Chuangyu Shield) 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Jiasule (Chuangyu Shield)，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
