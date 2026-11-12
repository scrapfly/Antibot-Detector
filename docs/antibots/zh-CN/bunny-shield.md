[English](../bunny-shield.md) | [Español](../es/bunny-shield.md) | [Русский](../ru/bunny-shield.md) | **简体中文** | [日本語](../ja/bunny-shield.md) | [Português (Brasil)](../pt-BR/bunny-shield.md) | [Deutsch](../de/bunny-shield.md) | [Français](../fr/bunny-shield.md) | [한국어](../ko/bunny-shield.md)

# Bunny Shield 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Bunny Shield 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Bunny Shield 绕过方法、想检测某个网站是否使用了 Bunny Shield，还是在排查网页抓取被 Bunny Shield 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Bunny Shield。本页列出 Scrapfly Antibot Detector 扩展用来识别 Bunny Shield 机器人检测的 5 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Bunny Shield 是 CDN 公司 bunny.net 的边缘安全产品。它为 bunny.net 上的站点加入 Web 应用防火墙、请求限速和 Bot 检测，并可以要求浏览器完成一道 JavaScript 工作量证明挑战。

官方网站: [https://bunny.net/shield/](https://bunny.net/shield/)

## 如何判断网站使用了 Bunny Shield

这些特征由扩展自身针对 `detect-bunny-shield` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-11-12）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^bunny_shield$` | 90% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) |
| `^bunny_shield_chk$` | 90% | bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| `^bunny_shield_id$` | 90% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) |
| `^bunny_shield_bd$` | 90% | bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^server$: ^BunnyCDN-[A-Z0-9]{2,6}-[0-9]{1,8}$` | 40% (仅作佐证) | Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Proof-of-work cookie with its checksum | 100% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs)和bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| Bot detection identifier and fingerprint cookies | 95% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs)和bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |
| Bunny Shield cookie on a bunny.net edge response | 95% | (bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs)或bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs)或bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs)或bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs))和Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Bunny Shield，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Bunny Shield 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Bunny Shield，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
