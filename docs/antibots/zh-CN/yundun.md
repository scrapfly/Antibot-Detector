[English](../yundun.md) | [Español](../es/yundun.md) | [Русский](../ru/yundun.md) | **简体中文** | [日本語](../ja/yundun.md) | [Português (Brasil)](../pt-BR/yundun.md) | [Deutsch](../de/yundun.md) | [Français](../fr/yundun.md) | [한국어](../ko/yundun.md)

# Yundun Cloud WAF 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Yundun Cloud WAF 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Yundun Cloud WAF 绕过方法、想检测某个网站是否使用了 Yundun Cloud WAF，还是在排查网页抓取被 Yundun Cloud WAF 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Yundun Cloud WAF。本页列出 Scrapfly Antibot Detector 扩展用来识别 Yundun Cloud WAF 机器人检测的 11 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

云盾（Yundun）是中国的云安全提供商，提供云 WAF 和抗 DDoS 服务。其检查常见于中国网站。

官方网站: [https://www.yundun.com/](https://www.yundun.com/)

## 如何判断网站使用了 Yundun Cloud WAF

这些特征由扩展自身针对 `detect-yundun` 的检测规则生成（规则版本 2.0.2，最后更新于 2026-10-29）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (仅作佐证) | Yundun WAF session cookie |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (仅作佐证) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (仅作佐证) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (仅作佐证) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges)和Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie和(Server header carrying the Yundun edge signature (legacy edges)或Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges)和Cache header carrying the Yundun edge signature (legacy edges)和Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge和X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs)和Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)或First-party Yundun WAF captcha script (cdn_cgi_bs_captcha))和(Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp)或Yundun WAF captcha marker cookie或Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp)和Yundun WAF captcha marker cookie和Server: WAF sent by the current Yundun edge |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Yundun Cloud WAF，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Yundun Cloud WAF 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Yundun Cloud WAF，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
