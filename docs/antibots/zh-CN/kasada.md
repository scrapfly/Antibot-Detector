[English](../kasada.md) | [Español](../es/kasada.md) | [Русский](../ru/kasada.md) | **简体中文** | [日本語](../ja/kasada.md) | [Português (Brasil)](../pt-BR/kasada.md) | [Deutsch](../de/kasada.md) | [Français](../fr/kasada.md) | [한국어](../ko/kasada.md)

# Kasada 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Kasada 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Kasada 绕过方法、想检测某个网站是否使用了 Kasada，还是在排查网页抓取被 Kasada 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Kasada。本页列出 Scrapfly Antibot Detector 扩展用来识别 Kasada 机器人检测的 8 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Kasada 是一家机器人缓解厂商。它在浏览器中运行客户端检查，并在之后的请求上附带证明，因此没有该证明的请求很可能被拒绝。

官方网站: [https://www.kasada.io/](https://www.kasada.io/)

## 如何判断网站使用了 Kasada

这些特征由扩展自身针对 `detect-kasada` 的检测规则生成（规则版本 2.1.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-kpsdk-ct$` | 100% | Kasada client token header on protected responses |
| `^x-kpsdk-(?:r\|cd\|st\|im\|v\|h)$` | 40% (仅作佐证) | Other Kasada response headers |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:ips\|p)\.js(?:[?#]\|$)` | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]{1,8}(?:\.js)?)?\?(?:[^#]*&)?(?:x-kpsdk-im\|KP_UIDz)=` | 40% (仅作佐证) | Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:tl\|fp\|mfc)(?:[?#]\|$)` | 100% | Kasada telemetry or fingerprint endpoint on the double-UUID path |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `KPSDK\.(?:configure\|start\|now)` | 10% | KPSDK API call in page scripts |
| `kpsdk-load` | 10% | Kasada load event name |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `KPSDK (typeof object)` | 75% | Kasada KPSDK object |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Client script with KPSDK running | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js)和(Kasada KPSDK object或KPSDK API call in page scripts或Kasada load event name) |
| Kasada token headers with its script or interstitial | 100% | (Kasada client token header on protected responses或Other Kasada response headers)和(Kasada client script on its double-UUID first-party path (ips.js or p.js)或Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im)或Kasada telemetry or fingerprint endpoint on the double-UUID path) |
| Interstitial script with KPSDK query | 90% | Kasada client script on its double-UUID first-party path (ips.js or p.js)和Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Kasada，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Kasada 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Kasada，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
