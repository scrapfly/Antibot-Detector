[English](../azure-waf.md) | [Español](../es/azure-waf.md) | [Русский](../ru/azure-waf.md) | **简体中文** | [日本語](../ja/azure-waf.md) | [Português (Brasil)](../pt-BR/azure-waf.md) | [Deutsch](../de/azure-waf.md) | [Français](../fr/azure-waf.md) | [한국어](../ko/azure-waf.md)

# Azure WAF 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Azure WAF 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Azure WAF 绕过方法、想检测某个网站是否使用了 Azure WAF，还是在排查网页抓取被 Azure WAF 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Azure WAF。本页列出 Scrapfly Antibot Detector 扩展用来识别 Azure WAF 机器人检测的 3 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Azure Web Application Firewall 是微软用于 Azure Front Door 和 Application Gateway 的 WAF。除了拦截攻击，它的 Bot 规则还可以用 JavaScript 挑战回应可疑客户端，在 Front Door 上还可以用 CAPTCHA。

官方网站: [https://learn.microsoft.com/azure/web-application-firewall/](https://learn.microsoft.com/azure/web-application-firewall/)

## 如何判断网站使用了 Azure WAF

这些特征由扩展自身针对 `detect-azure-waf` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-11-12）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^afd_azwaf_jsclearance$` | 90% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^appgw_azwaf_jsclearance$` | 90% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^afd_azwaf_captcha$` | 90% | afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Front Door JavaScript challenge and CAPTCHA cookies | 100% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn)和afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |
| JavaScript challenge cookies of Front Door and Application Gateway | 95% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn)和appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| Application Gateway JavaScript challenge cookie with the Front Door CAPTCHA cookie | 95% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn)和afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Azure WAF，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Azure WAF 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Azure WAF，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
