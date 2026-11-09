[English](../radware.md) | [Español](../es/radware.md) | [Русский](../ru/radware.md) | **简体中文** | [日本語](../ja/radware.md) | [Português (Brasil)](../pt-BR/radware.md) | [Deutsch](../de/radware.md) | [Français](../fr/radware.md) | [한국어](../ko/radware.md)

# Radware Bot Manager 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Radware Bot Manager 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Radware Bot Manager 绕过方法、想检测某个网站是否使用了 Radware Bot Manager，还是在排查网页抓取被 Radware Bot Manager 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Radware Bot Manager。本页列出 Scrapfly Antibot Detector 扩展用来识别 Radware Bot Manager 机器人检测的 10 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Radware Bot Manager，前身为 ShieldSquare，是 Radware 的机器人管理产品。Radware 也销售云 WAF，检测器会查找这两者的痕迹。

官方网站: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## 如何判断网站使用了 Radware Bot Manager

这些特征由扩展自身针对 `detect-radware` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (仅作佐证) | Radware Bot Manager cookies written by its JavaScript |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `CloudWebSec.radware.com` | 20% (仅作佐证) | Script reference to the CloudWebSec vendor portal host |
| `Unauthorized Request Blocked` | 20% (仅作佐证) | Script reference to the Radware block-page message |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | Script reference to the CloudWebSec vendor portal host和Script reference to the Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header和(Script reference to the CloudWebSec vendor portal host或Script reference to the Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header和Script reference to the CloudWebSec vendor portal host和Script reference to the Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf)和First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf)和First-party Radware Bot Manager script (stormcaster.js)和Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host和Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge和(Radware Bot Manager session cookies (__uzma … __uzmf)或Radware Bot Manager cookies written by its JavaScript) |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Radware Bot Manager，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Radware Bot Manager 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Radware Bot Manager，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
