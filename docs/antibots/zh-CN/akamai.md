[English](../akamai.md) | [Español](../es/akamai.md) | [Русский](../ru/akamai.md) | **简体中文** | [日本語](../ja/akamai.md) | [Português (Brasil)](../pt-BR/akamai.md) | [Deutsch](../de/akamai.md) | [Français](../fr/akamai.md) | [한국어](../ko/akamai.md)

# Akamai Bot Manager 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Akamai Bot Manager 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Akamai Bot Manager 绕过方法、想检测某个网站是否使用了 Akamai Bot Manager，还是在排查网页抓取被 Akamai Bot Manager 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Akamai Bot Manager。本页列出 Scrapfly Antibot Detector 扩展用来识别 Akamai Bot Manager 机器人检测的 19 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Akamai Bot Manager 是 CDN 和安全公司 Akamai Technologies 的机器人管理产品。它作为 Akamai 边缘平台的一部分销售给大型网站，旨在区分真人、良性机器人和恶意自动化。

官方网站: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## 如何判断网站使用了 Akamai Bot Manager

这些特征由扩展自身针对 `detect-akamai` 的检测规则生成（规则版本 2.2.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|sv\|s\|so\|lso)$` | 30% (仅作佐证) | Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (仅作佐证) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### 响应头

页面或其请求返回的 HTTP 响应头。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (仅作佐证) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (仅作佐证) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### 请求和响应数据

页面发送到匹配地址或从该地址接收的数据。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape和(Bot Manager session cookie (hash~token)或Bot Manager edge session cookie或Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/或Bot Manager sensor object (bmak)或Bot Manager sensor_data POST body)和(Bot Manager sensor cookie in its documented hash~state~token shape或Bot Manager session cookie (hash~token)或Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script和Bot Manager sensor cookie in its documented hash~state~token shape和(Akamai edge server header; CDN delivery, not Bot Manager on its own或Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own或Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint或SBSD challenge POST to the sbsd endpoint)和SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own或Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own)和(Bot Manager sensor cookie in its documented hash~state~token shape或Bot Manager session cookie (hash~token)或Bot Manager edge session cookie) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie和Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/和(sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved)或Bot Manager sensor cookie in its documented hash~state~token shape或Bot Manager session cookie (hash~token)) |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Akamai Bot Manager，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Akamai Bot Manager 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Akamai Bot Manager，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
