[English](../kount.md) | [Español](../es/kount.md) | [Русский](../ru/kount.md) | **简体中文** | [日本語](../ja/kount.md) | [Português (Brasil)](../pt-BR/kount.md) | [Deutsch](../de/kount.md) | [Français](../fr/kount.md) | [한국어](../ko/kount.md)

# Kount 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Kount 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Kount 绕过方法、想检测某个网站是否使用了 Kount，还是在排查网页抓取被 Kount 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Kount。本页列出 Scrapfly Antibot Detector 扩展用来识别 Kount 机器人检测的 4 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Kount 隶属于 Equifax，是一家支付欺诈防范公司。它的 Device Data Collector 会收集浏览器信息，由商户的后端发送给 Kount 以做出风险决策。

官方网站: [https://kount.com/](https://kount.com/)

## 如何判断网站使用了 Kount

这些特征由扩展自身针对 `detect-kount` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://(?:ssl\|tst)\.kaptcha\.com/collect/sdk\?(?:[^#]*&)?m=[0-9]{3,}(?:[&#]\|$)` | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) |
| `^https://(?:ssl\|tst)\.kaptcha\.com/(?:cs/(?:config\|generatecookie\|storecookie\|location)\|session/[A-Za-z0-9_-]+\|logo\.htm\|fin)(?:[?#]\|$)` | 100% | Kount Web SDK request to the vendor kaptcha.com collector |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `kaxsdc` | 20% | Script reference to the kaxsdc class that triggers Kount data collection |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `ka.ClientSDK (typeof function)` | 60% | ka.ClientSDK class of the Kount data collector |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Kount collector script with its class or trigger | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>)和(ka.ClientSDK class of the Kount data collector或Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount collector request with its script or class | 95% | Kount Web SDK request to the vendor kaptcha.com collector和(Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>)或ka.ClientSDK class of the Kount data collector或Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount class with its trigger | 80% | ka.ClientSDK class of the Kount data collector和Script reference to the kaxsdc class that triggers Kount data collection |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Kount，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Kount 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Kount，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
