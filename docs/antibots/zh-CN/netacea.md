[English](../netacea.md) | [Español](../es/netacea.md) | [Русский](../ru/netacea.md) | **简体中文** | [日本語](../ja/netacea.md) | [Português (Brasil)](../pt-BR/netacea.md) | [Deutsch](../de/netacea.md) | [Français](../fr/netacea.md) | [한국어](../ko/netacea.md)

# Netacea 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Netacea 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Netacea 绕过方法、想检测某个网站是否使用了 Netacea，还是在排查网页抓取被 Netacea 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Netacea。本页列出 Scrapfly Antibot Detector 扩展用来识别 Netacea 机器人检测的 3 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Netacea 是一家机器人管理厂商，它不需要在每个请求上使用页面脚本，而是在边缘或服务器端读取流量。它的 Cookie 是通常可见的痕迹，其名称可以按客户单独更改。

官方网站: [https://www.netacea.com/](https://www.netacea.com/)

## 如何判断网站使用了 Netacea

这些特征由扩展自身针对 `detect-netacea` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^_mitata$` | 60% | Netacea mitigation cookie, in the browser or set by the server (default name) |
| `^_mitatacaptcha$` | 100% | Netacea captcha-serving cookie (default name) |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/AtaVerifyCaptcha(?:[?#]\|$)` | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Captcha cookie with a mitigation cookie | 100% | Netacea captcha-serving cookie (default name)和Netacea mitigation cookie, in the browser or set by the server (default name) |
| Captcha verification with a Netacea cookie | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations)和Netacea captcha-serving cookie (default name) |
| Captcha verification with the mitigation cookie | 95% | First-party Netacea captcha verification endpoint (default path in the vendor integrations)和Netacea mitigation cookie, in the browser or set by the server (default name) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Netacea，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Netacea 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Netacea，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
