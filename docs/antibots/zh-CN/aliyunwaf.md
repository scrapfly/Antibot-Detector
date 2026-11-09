[English](../aliyunwaf.md) | [Español](../es/aliyunwaf.md) | [Русский](../ru/aliyunwaf.md) | **简体中文** | [日本語](../ja/aliyunwaf.md) | [Português (Brasil)](../pt-BR/aliyunwaf.md) | [Deutsch](../de/aliyunwaf.md) | [Français](../fr/aliyunwaf.md) | [한국어](../ko/aliyunwaf.md)

# Alibaba Cloud WAF 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Alibaba Cloud WAF 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Alibaba Cloud WAF 绕过方法、想检测某个网站是否使用了 Alibaba Cloud WAF，还是在排查网页抓取被 Alibaba Cloud WAF 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Alibaba Cloud WAF。本页列出 Scrapfly Antibot Detector 扩展用来识别 Alibaba Cloud WAF 机器人检测的 8 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

阿里云 WAF 是阿里云的 Web 应用防火墙。除了过滤攻击之外，它还可以向不信任的客户端下发 JavaScript 质询，因此许多中国网站和一些全球网站前面都能看到它。

官方网站: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## 如何判断网站使用了 Alibaba Cloud WAF

这些特征由扩展自身针对 `detect-aliyunwaf` 的检测规则生成（规则版本 2.1.0，最后更新于 2026-10-16）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (仅作佐证) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (仅作佐证) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (仅作佐证) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (仅作佐证) | Trace-id line of the Alibaba Cloud WAF block page |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie和Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge)和Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie和(Alibaba Cloud WAF load-balancing session cookie或Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host和(Alibaba Cloud WAF JavaScript-challenge clearance cookie或Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI)或Banner image of the Alibaba Cloud WAF 405 block page (English UI))和Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie和Alibaba Cloud WAF load-balancing session cookie和Block-page help resources on the Aliyun Yundun errors host |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Alibaba Cloud WAF，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Alibaba Cloud WAF 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Alibaba Cloud WAF，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
