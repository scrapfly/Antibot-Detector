[English](../perimeterx.md) | [Español](../es/perimeterx.md) | [Русский](../ru/perimeterx.md) | **简体中文** | [日本語](../ja/perimeterx.md) | [Português (Brasil)](../pt-BR/perimeterx.md) | [Deutsch](../de/perimeterx.md) | [Français](../fr/perimeterx.md) | [한국어](../ko/perimeterx.md)

# HUMAN (PerimeterX) 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

HUMAN (PerimeterX) 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 HUMAN (PerimeterX) 绕过方法、想检测某个网站是否使用了 HUMAN (PerimeterX)，还是在排查网页抓取被 HUMAN (PerimeterX) 拦截的问题，第一步都是一样的：确认响应你请求的确实是 HUMAN (PerimeterX)。本页列出 Scrapfly Antibot Detector 扩展用来识别 HUMAN (PerimeterX) 机器人检测的 12 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

PerimeterX 现已并入 HUMAN Security。它的 bot defender 会在页面上放置一个脚本，根据行为和设备信号为访客评分，并可以返回“按住不放”之类的质询。

官方网站: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## 如何判断网站使用了 HUMAN (PerimeterX)

这些特征由扩展自身针对 `detect-perimeterx` 的检测规则生成（规则版本 2.3.1，最后更新于 2026-10-30）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (仅作佐证) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (仅作佐证) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (仅作佐证) | Optional PerimeterX init callback defined by the site |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID或First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js)或PerimeterX application ID或PerimeterX collector endpoint)和(PerimeterX risk token cookie (_px2 or _px3)或PerimeterX first-party server cookie或PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | 以下至少 2 项：PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host和(PerimeterX application ID或Script assigning the PerimeterX app ID (window._pxAppId)或Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js)和(PerimeterX application ID或Script assigning the PerimeterX app ID (window._pxAppId)或Optional PerimeterX init callback defined by the site) |

## 难度

**高.** 高表示扩展将这种防护评为最难绕过的类型之一：它通常把客户端检查与行为分析或服务端评分结合在一起。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 HUMAN (PerimeterX)，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 HUMAN (PerimeterX) 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 HUMAN (PerimeterX)，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
