[English](../vercel.md) | [Español](../es/vercel.md) | [Русский](../ru/vercel.md) | **简体中文** | [日本語](../ja/vercel.md) | [Português (Brasil)](../pt-BR/vercel.md) | [Deutsch](../de/vercel.md) | [Français](../fr/vercel.md) | [한국어](../ko/vercel.md)

# Vercel Firewall 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Vercel Firewall 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Vercel Firewall 绕过方法、想检测某个网站是否使用了 Vercel Firewall，还是在排查网页抓取被 Vercel Firewall 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Vercel Firewall。本页列出 Scrapfly Antibot Detector 扩展用来识别 Vercel Firewall 机器人检测的 9 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Vercel Firewall 是 Vercel 托管平台的安全层。它包括可配置的规则、Attack Mode 质询页面和 BotID 检查。

官方网站: [https://vercel.com/docs/vercel-firewall](https://vercel.com/docs/vercel-firewall)

## 如何判断网站使用了 Vercel Firewall

这些特征由扩展自身针对 `detect-vercel` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-vercel-mitigated$: ^challenge$` | 100% | x-vercel-mitigated: challenge, the Vercel Firewall served its challenge |
| `^x-vercel-mitigated$: ^deny$` | 100% | x-vercel-mitigated: deny, the Vercel Firewall blocked the request |
| `^x-vercel-challenge-(?:token\|solution\|version)$` | 60% | x-vercel-challenge-token header of the Vercel Security Checkpoint |
| `^server$: ^Vercel$` | 15% (仅作佐证) | Hosted on Vercel; hosting, not bot protection on its own |
| `^x-vercel-id$` | 15% (仅作佐证) | Vercel request id header; present on any Vercel response |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/vercel/security/static/challenge(?:\.v[0-9]+)?(?:\.min)?\.js(?:[?#]\|$)` | 90% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ |
| `^https?://[^/?#]+/\.well-known/vercel/security/request-challenge(?:[?#]\|$)` | 50% (仅作佐证) | Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge |
| `^https?://[^/?#]+/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/(?:a-4-a/c\|p)\.js(?:[?#]\|$)` | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3` | 30% | BotID path written in the page's scripts |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Vercel Security Checkpoint on a Vercel response | 100% | (x-vercel-mitigated: challenge, the Vercel Firewall served its challenge或x-vercel-mitigated: deny, the Vercel Firewall blocked the request或Vercel Security Checkpoint script under /.well-known/vercel/security/static/)和(Hosted on Vercel; hosting, not bot protection on its own或Vercel request id header; present on any Vercel response) |
| BotID script with its path in the page's scripts | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js)和BotID path written in the page's scripts |
| Checkpoint script with its answer request or token | 95% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/和(Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge或x-vercel-challenge-token header of the Vercel Security Checkpoint) |
| Checkpoint token or answer request on a Vercel response | 85% | (x-vercel-challenge-token header of the Vercel Security Checkpoint或Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge)和(Hosted on Vercel; hosting, not bot protection on its own或Vercel request id header; present on any Vercel response) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Vercel Firewall，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Vercel Firewall 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Vercel Firewall，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
