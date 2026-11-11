[English](../huaweicloud-waf.md) | [Español](../es/huaweicloud-waf.md) | [Русский](../ru/huaweicloud-waf.md) | **简体中文** | [日本語](../ja/huaweicloud-waf.md) | [Português (Brasil)](../pt-BR/huaweicloud-waf.md) | [Deutsch](../de/huaweicloud-waf.md) | [Français](../fr/huaweicloud-waf.md) | [한국어](../ko/huaweicloud-waf.md)

# Huawei Cloud WAF 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Huawei Cloud WAF 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Huawei Cloud WAF 绕过方法、想检测某个网站是否使用了 Huawei Cloud WAF，还是在排查网页抓取被 Huawei Cloud WAF 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Huawei Cloud WAF。本页列出 Scrapfly Antibot Detector 扩展用来识别 Huawei Cloud WAF 机器人检测的 3 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Huawei Cloud WAF 是华为云的 Web 应用防火墙。站点接入后，它会在访客请求中加入会话 Cookie，其 CC 攻击防护和反爬虫规则用这些 Cookie 来统计和跟踪请求。

官方网站: [https://www.huaweicloud.com/intl/en-us/product/waf.html](https://www.huaweicloud.com/intl/en-us/product/waf.html)

## 如何判断网站使用了 Huawei Cloud WAF

这些特征由扩展自身针对 `detect-huaweicloud-waf` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-11-11）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^HWWAFSESID$` | 90% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| `^HWWAFSESTIME$` | 90% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^server$: HuaweiCloudWAF` | 40% (仅作佐证) | Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Both WAF session cookies | 100% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help)和HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| Session ID cookie with the WAF server header | 95% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help)和Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |
| Session timestamp cookie with the WAF server header | 95% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help)和Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Huawei Cloud WAF，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Huawei Cloud WAF 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Huawei Cloud WAF，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
