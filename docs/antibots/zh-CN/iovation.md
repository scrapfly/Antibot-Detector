[English](../iovation.md) | [Español](../es/iovation.md) | [Русский](../ru/iovation.md) | **简体中文** | [日本語](../ja/iovation.md) | [Português (Brasil)](../pt-BR/iovation.md) | [Deutsch](../de/iovation.md) | [Français](../fr/iovation.md) | [한국어](../ko/iovation.md)

# iovation (TransUnion TruValidate) 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

iovation (TransUnion TruValidate) 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 iovation (TransUnion TruValidate) 绕过方法、想检测某个网站是否使用了 iovation (TransUnion TruValidate)，还是在排查网页抓取被 iovation (TransUnion TruValidate) 拦截的问题，第一步都是一样的：确认响应你请求的确实是 iovation (TransUnion TruValidate)。本页列出 Scrapfly Antibot Detector 扩展用来识别 iovation (TransUnion TruValidate) 机器人检测的 9 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

iovation 是一项设备识别和欺诈防范服务，现已作为 TruValidate 并入 TransUnion。它的脚本会收集设备 blackbox 数据，网站在敏感操作时一并提交。

官方网站: [https://www.iovation.com/](https://www.iovation.com/)

## 如何判断网站使用了 iovation (TransUnion TruValidate)

这些特征由扩展自身针对 `detect-iovation` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (仅作佐证) | iovation logo.js served through the site's own /iojs/ proxy |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (仅作佐证) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (仅作佐证) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (仅作佐证) | io_global_object_name setting read by the iovation scripts |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (仅作佐证) | Hidden ioBlackBox field that receives the iovation blackbox |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js)或iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors))和(IGLOO.getBlackbox function of the iovation loader或IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy或iovation logo.js served through the site's own /iojs/ proxy)和(IGLOO.getBlackbox function of the iovation loader或IGLOO.fp object created by the iovation profiling scripts或io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader或IGLOO.fp object created by the iovation profiling scripts)和(io_global_object_name setting read by the iovation scripts或iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id)或Hidden ioBlackBox field that receives the iovation blackbox) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 iovation (TransUnion TruValidate)，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 iovation (TransUnion TruValidate) 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 iovation (TransUnion TruValidate)，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
