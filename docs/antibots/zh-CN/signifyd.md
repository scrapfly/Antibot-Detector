[English](../signifyd.md) | [Español](../es/signifyd.md) | [Русский](../ru/signifyd.md) | **简体中文** | [日本語](../ja/signifyd.md) | [Português (Brasil)](../pt-BR/signifyd.md) | [Deutsch](../de/signifyd.md) | [Français](../fr/signifyd.md) | [한국어](../ko/signifyd.md)

# Signifyd 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Signifyd 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Signifyd 绕过方法、想检测某个网站是否使用了 Signifyd，还是在排查网页抓取被 Signifyd 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Signifyd。本页列出 Scrapfly Antibot Detector 扩展用来识别 Signifyd 机器人检测的 9 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Signifyd 是网店使用的电商欺诈防护平台。它的设备画像脚本在商店页面上收集设备和浏览器数据，供 Signifyd 评估订单的欺诈风险。

官方网站: [https://www.signifyd.com/](https://www.signifyd.com/)

## 如何判断网站使用了 Signifyd

这些特征由扩展自身针对 `detect-signifyd` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-11-12）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://cdn-scripts\.signifyd\.com/(?:api\|bigcommerce\|shopify)/script-tag\.js(?:[?#]\|$)` | 100% | Signifyd device profiling script script-tag.js on cdn-scripts.signifyd.com (standard, BigCommerce or Shopify) |
| `^https://cdn-scripts\.signifyd\.com/(?:api/company_toolkit\|o/(?:loader\|lite)\|bigcommerce/conversion-tracking)\.js(?:[?#]\|$)` | 100% | Other Signifyd scripts on cdn-scripts.signifyd.com (company_toolkit.js, loader.js, lite.js, BigCommerce conversion-tracking.js) |
| `^https://dp\.signifyd\.com/fp-web(?:[?#]\|$)` | 100% | Device profile sent to dp.signifyd.com/fp-web |
| `^https?://[^/?#]+/api/script-tag\.js(?:[?#]\|$)` | 40% (仅作佐证) | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only |
| `^https?://[^/?#]+/o/lite\.js(?:[?#]\|$)` | 30% (仅作佐证) | First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only |
| `^https?://[^/?#]+/fp-web(?:[?#]\|$)` | 30% (仅作佐证) | First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `signifyd.pageView (typeof function)` | 60% | signifyd.pageView method the Signifyd script exposes for single-page applications |
| `sigScriptLoader (typeof object)` | 60% | sigScriptLoader object of the Signifyd script, with its isInitialized flag |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `script#script-tag-api[data-order-session-id], script#sig-api[data-order-session-id], script#sig-bc[data-store-id]` | 60% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Signifyd script tag served from the site with its profiling routes | 100% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute和First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only和(First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only或First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only) |
| Signifyd script tag with its runtime | 95% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute和(signifyd.pageView method the Signifyd script exposes for single-page applications或sigScriptLoader object of the Signifyd script, with its isInitialized flag) |
| All three Signifyd routes served from the site | 85% | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only和First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only和First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |
| Signifyd loader and page-view method | 85% | signifyd.pageView method the Signifyd script exposes for single-page applications和sigScriptLoader object of the Signifyd script, with its isInitialized flag |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Signifyd，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Signifyd 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Signifyd，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
