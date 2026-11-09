[English](../openai-sentinel.md) | [Español](../es/openai-sentinel.md) | [Русский](../ru/openai-sentinel.md) | **简体中文** | [日本語](../ja/openai-sentinel.md) | [Português (Brasil)](../pt-BR/openai-sentinel.md) | [Deutsch](../de/openai-sentinel.md) | [Français](../fr/openai-sentinel.md) | [한국어](../ko/openai-sentinel.md)

# OpenAI Sentinel 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

OpenAI Sentinel 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 OpenAI Sentinel 绕过方法、想检测某个网站是否使用了 OpenAI Sentinel，还是在排查网页抓取被 OpenAI Sentinel 拦截的问题，第一步都是一样的：确认响应你请求的确实是 OpenAI Sentinel。本页列出 Scrapfly Antibot Detector 扩展用来识别 OpenAI Sentinel 机器人检测的 11 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Sentinel 是 ChatGPT 和 OpenAI 登录所使用的反滥用层的名称。它会在某些请求之前向浏览器下发质询。它保护的是 OpenAI 自己的服务，而不是面向其他网站的产品。

官方网站: [https://chatgpt.com/](https://chatgpt.com/)

## 如何判断网站使用了 OpenAI Sentinel

这些特征由扩展自身针对 `detect-openai-sentinel` 的检测规则生成（规则版本 2.1.1，最后更新于 2026-11-04）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements(?:/[a-z]{3,12})?(?:[?#]\|$)` | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/sdk\.js(?:[?#]\|$)` | 100% | Sentinel SDK loader (/backend-api/sentinel/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/sentinel/[0-9a-z]{6,24}/sdk\.js(?:[?#]\|$)` | 100% | Versioned Sentinel SDK (/sentinel/<build>/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/frame\.html(?:[?#]\|$)` | 100% | Hidden Sentinel frame (/backend-api/sentinel/frame.html) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/req(?:[?#]\|$)` | 100% | Sentinel token request sent by the SDK (/backend-api/sentinel/req) |
| `^https://chatgpt\.com/(?:[a-z0-9-]{3,20}/)?assets/(?:[a-z]{2,12}-){0,4}sentinel(?:-[a-z]{2,12}){0,3}-[A-Za-z0-9_-]{8}\.js(?:[?#]\|$)` | 70% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `SentinelSDK (typeof object)` | 75% | Sentinel SDK object (window.SentinelSDK) |

### 请求和响应数据

页面发送到匹配地址或从该地址接收的数据。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/ ; body "p"\s*:\s*"gAAAAAC` | 100% | Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| `URL ^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements/finalize(?:[?#]\|$) ; body "proofofwork"\s*:\s*"gAAAAAB` | 100% | Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "proofofwork"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "so"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for session telemetry (so.required: true) |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Chat-requirements request with its requirements token | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work和Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| Proof of work asked for and answered | 100% | Sentinel response asking for a proof of work (proofofwork.required: true)和Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| Sentinel SDK with its frame or token request | 100% | (Sentinel SDK loader (/backend-api/sentinel/sdk.js)或Versioned Sentinel SDK (/sentinel/<build>/sdk.js))和(Hidden Sentinel frame (/backend-api/sentinel/frame.html)或Sentinel token request sent by the SDK (/backend-api/sentinel/req)) |
| Sentinel SDK object with its script | 90% | Sentinel SDK object (window.SentinelSDK)和(Sentinel SDK loader (/backend-api/sentinel/sdk.js)或Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) |
| ChatGPT Sentinel scripts with Sentinel traffic | 90% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js)和(Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint或Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize或Sentinel response asking for a proof of work (proofofwork.required: true)) |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 OpenAI Sentinel，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 OpenAI Sentinel 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 OpenAI Sentinel，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
