[English](../fastly.md) | [Español](../es/fastly.md) | [Русский](../ru/fastly.md) | **简体中文** | [日本語](../ja/fastly.md) | [Português (Brasil)](../pt-BR/fastly.md) | [Deutsch](../de/fastly.md) | [Français](../fr/fastly.md) | [한국어](../ko/fastly.md)

# Fastly Bot Management 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Fastly Bot Management 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Fastly Bot Management 绕过方法、想检测某个网站是否使用了 Fastly Bot Management，还是在排查网页抓取被 Fastly Bot Management 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Fastly Bot Management。本页列出 Scrapfly Antibot Detector 扩展用来识别 Fastly Bot Management 机器人检测的 6 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Fastly Bot Management 是边缘云提供商 Fastly 的机器人检测产品。它通过 Fastly 的边缘网络提供，并且根据其检测器的判断，可能还会运行客户端检查。

官方网站: [https://www.fastly.com/products/bot-management](https://www.fastly.com/products/bot-management)

## 如何判断网站使用了 Fastly Bot Management

这些特征由扩展自身针对 `detect-fastly` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^_fs_ch_st_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge start cookie (_fs_ch_st_<random>) |
| `^_fs_ch_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge complete cookie (_fs_ch_cp_<random>) |
| `^_fs_cd_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/challenge\.js(?:[?#]\|$)` | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/assets/[A-Za-z0-9_.-]{1,64}\.js(?:[?#]\|$)` | 100% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `div.fastly-challenge` | 40% | Embedded Fastly dynamic challenge container (div.fastly-challenge) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Fastly challenge script with its cookie or container | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path和(Fastly challenge start cookie (_fs_ch_st_<random>)或Fastly challenge complete cookie (_fs_ch_cp_<random>)或Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly challenge complete cookie with its start cookie or container | 95% | Fastly challenge complete cookie (_fs_ch_cp_<random>)和(Fastly challenge start cookie (_fs_ch_st_<random>)或Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly detection script with its cookie | 95% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path和Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |
| Fastly challenge container with its start cookie | 90% | Embedded Fastly dynamic challenge container (div.fastly-challenge)和Fastly challenge start cookie (_fs_ch_st_<random>) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Fastly Bot Management，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Fastly Bot Management 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Fastly Bot Management，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
