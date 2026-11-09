[English](../amazon.md) | [Español](../es/amazon.md) | [Русский](../ru/amazon.md) | **简体中文** | [日本語](../ja/amazon.md) | [Português (Brasil)](../pt-BR/amazon.md) | [Deutsch](../de/amazon.md) | [Français](../fr/amazon.md) | [한국어](../ko/amazon.md)

# Amazon Bot Protection 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Amazon Bot Protection 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Amazon Bot Protection 绕过方法、想检测某个网站是否使用了 Amazon Bot Protection，还是在排查网页抓取被 Amazon Bot Protection 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Amazon Bot Protection。本页列出 Scrapfly Antibot Detector 扩展用来识别 Amazon Bot Protection 机器人检测的 3 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

亚马逊的登录页面会收集客户端浏览器指纹，登录表单在提交凭据时一并提交该指纹。它属于亚马逊自有的反滥用工具，而不是其他网站可以购买的产品。

官方网站: [https://www.amazon.com/](https://www.amazon.com/)

## 如何判断网站使用了 Amazon Bot Protection

这些特征由扩展自身针对 `detect-amazon` 的检测规则生成（规则版本 2.1.1，最后更新于 2026-11-04）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `fwcimCmd` | 30% (仅作佐证) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (仅作佐证) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint和FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint和Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages和Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## 难度

**高.** 高表示扩展将这种防护评为最难绕过的类型之一：它通常把客户端检查与行为分析或服务端评分结合在一起。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Amazon Bot Protection，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Amazon Bot Protection 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Amazon Bot Protection，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
