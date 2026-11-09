[English](../siteground-captcha.md) | [Español](../es/siteground-captcha.md) | [Русский](../ru/siteground-captcha.md) | **简体中文** | [日本語](../ja/siteground-captcha.md) | [Português (Brasil)](../pt-BR/siteground-captcha.md) | [Deutsch](../de/siteground-captcha.md) | [Français](../fr/siteground-captcha.md) | [한국어](../ko/siteground-captcha.md)

# SiteGround SG-CAPTCHA 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

SiteGround SG-CAPTCHA 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 SiteGround SG-CAPTCHA 绕过方法、想检测某个网站是否使用了 SiteGround SG-CAPTCHA，还是在排查网页抓取被 SiteGround SG-CAPTCHA 拦截的问题，第一步都是一样的：确认响应你请求的确实是 SiteGround SG-CAPTCHA。本页列出 Scrapfly Antibot Detector 扩展用来识别 SiteGround SG-CAPTCHA 机器人检测的 3 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

SG-CAPTCHA 是 SiteGround 托管服务使用的反爬质询。看起来像自动化的访客会被送到质询页面，必须通过后才能加载网站。

官方网站: [https://www.siteground.com/blog/new-anti-bot-ai/](https://www.siteground.com/blog/new-anti-bot-ai/)

## 如何判断网站使用了 SiteGround SG-CAPTCHA

这些特征由扩展自身针对 `detect-siteground-captcha` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-11-05）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^sg-captcha$: ^challenge$` | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/sgcaptcha/(?:[?#]\|$)` | 100% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `\bsg(?:challenge\|submit_url)\b` | 30% | SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| sg-captcha header on the SG-CAPTCHA challenge page | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge和SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |
| sg-captcha header with the challenge constants in the page's scripts | 95% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge和SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |
| SG-CAPTCHA challenge page with its constants in the page's scripts | 90% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/和SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 SiteGround SG-CAPTCHA，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 SiteGround SG-CAPTCHA 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 SiteGround SG-CAPTCHA，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
