[English](../cloudflare.md) | [Español](../es/cloudflare.md) | [Русский](../ru/cloudflare.md) | **简体中文** | [日本語](../ja/cloudflare.md) | [Português (Brasil)](../pt-BR/cloudflare.md) | [Deutsch](../de/cloudflare.md) | [Français](../fr/cloudflare.md) | [한국어](../ko/cloudflare.md)

# Cloudflare Bot Management 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Cloudflare Bot Management 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Cloudflare Bot Management 绕过方法、想检测某个网站是否使用了 Cloudflare Bot Management，还是在排查网页抓取被 Cloudflare Bot Management 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Cloudflare Bot Management。本页列出 Scrapfly Antibot Detector 扩展用来识别 Cloudflare Bot Management 机器人检测的 11 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Cloudflare Bot Management 是 Cloudflare 的付费机器人检测产品，通过其全球网络提供。Cloudflare 也提供免费的质询页面，因此出现 Cloudflare 质询本身并不意味着启用了付费产品。

官方网站: [https://www.cloudflare.com/products/bot-management/](https://www.cloudflare.com/products/bot-management/)

## 如何判断网站使用了 Cloudflare Bot Management

这些特征由扩展自身针对 `detect-cloudflare` 的检测规则生成（规则版本 2.3.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^cf_clearance$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Challenge clearance cookie, set after passing a Cloudflare challenge |
| `^__cf_bm$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}\.[0-9]{5,8}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode |
| `^cf_chl_rc_(?:i\|ni\|m)$` | 85% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^cf-mitigated$: ^challenge$` | 100% | Response header Cloudflare sends when it served a challenge page |
| `^server$: ^cloudflare$` | 15% (仅作佐证) | Served through Cloudflare; CDN delivery, not bot management on its own |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?orchestrate/(?:chl_page\|managed\|jsch\|captcha)/` | 100% | Challenge page orchestrator under /cdn-cgi/challenge-platform/ |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?scripts/jsd/(?:[0-9a-f]{6,20}/)?main\.js(?:[?#]\|$)` | 100% | Bot Management JavaScript detections script |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?jsd/oneshot/` | 100% | Bot Management JavaScript detections report (/cdn-cgi/challenge-platform/…/jsd/oneshot/) |
| `^https://challenges\.cloudflare\.com/` | 40% (仅作佐证) | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `_cf_chl_opt` | 20% | Script reference to the _cf_chl_opt challenge options object |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `_cf_chl_opt (typeof object)` | 85% | Challenge options object present on a Cloudflare challenge page |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Challenge page orchestrator and challenge options object | 100% | (Challenge page orchestrator under /cdn-cgi/challenge-platform/或Response header Cloudflare sends when it served a challenge page)和(Challenge options object present on a Cloudflare challenge page或Script reference to the _cf_chl_opt challenge options object) |
| Clearance cookie with Bot Management cookie | 85% | Challenge clearance cookie, set after passing a Cloudflare challenge和(Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode或Served through Cloudflare; CDN delivery, not bot management on its own) |
| Bot Management script on a Cloudflare zone | 75% | Bot Management JavaScript detections script和(Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode或Served through Cloudflare; CDN delivery, not bot management on its own) |
| Challenge host request on a Cloudflare zone with a challenge signal | 90% | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only和(Challenge clearance cookie, set after passing a Cloudflare challenge或Challenge options object present on a Cloudflare challenge page或Challenge page orchestrator under /cdn-cgi/challenge-platform/) |
| Challenge platform cookie with a Cloudflare clearance, server header or challenge | 95% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m)和(Challenge clearance cookie, set after passing a Cloudflare challenge或Served through Cloudflare; CDN delivery, not bot management on its own或Challenge page orchestrator under /cdn-cgi/challenge-platform/或Challenge options object present on a Cloudflare challenge page) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Cloudflare Bot Management，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Cloudflare Bot Management 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Cloudflare Bot Management，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
