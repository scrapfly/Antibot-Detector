[English](../fingerprintjs.md) | [Español](../es/fingerprintjs.md) | [Русский](../ru/fingerprintjs.md) | **简体中文** | [日本語](../ja/fingerprintjs.md) | [Português (Brasil)](../pt-BR/fingerprintjs.md) | [Deutsch](../de/fingerprintjs.md) | [Français](../fr/fingerprintjs.md) | [한국어](../ko/fingerprintjs.md)

# FingerprintJS 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

FingerprintJS 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 FingerprintJS 绕过方法、想检测某个网站是否使用了 FingerprintJS，还是在排查网页抓取被 FingerprintJS 拦截的问题，第一步都是一样的：确认响应你请求的确实是 FingerprintJS。本页列出 Scrapfly Antibot Detector 扩展用来识别 FingerprintJS 机器人检测的 13 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

FingerprintJS 是一个浏览器指纹库，有开源版本，也有 Fingerprint 提供的商业 Pro 服务。其 BotD 库是另一个独立的开源机器人检测工具。发现它只说明网站在收集设备信号，不一定意味着它会拦截机器人。

官方网站: [https://fingerprint.com/](https://fingerprint.com/)

## 如何判断网站使用了 FingerprintJS

这些特征由扩展自身针对 `detect-fingerprintjs` 的检测规则生成（规则版本 2.3.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.){0,2}fpcdn\.io/v[34](?:[/?#]\|$)` | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host |
| `^https://openfpcdn\.io/fingerprintjs/v[0-9]+(?:[/?#]\|$)` | 100% | FingerprintJS open-source library on the vendor openfpcdn.io host |
| `^https://fpnpmcdn\.net/v[34]/[A-Za-z0-9]+/loader_v\d+\.\d+\.\d+\.js(?:[?#]\|$)` | 100% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net |
| `^https://(?:[a-z0-9-]+\.)?api\.fpjs\.(?:io\|sh\|pro)(?:[/?#]\|$)` | 100% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?ci=jsl?/[34]\.\d+\.\d+(?:[&#]\|$)` | 30% (仅作佐证) | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter |
| `^https?://[^/?#]+/(?:[^?#]*/)?fp\.(?:esm\|umd\|cjs)(?:\.[A-Za-z0-9_-]{6,})?\.js(?:[?#]\|$)` | 50% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own |
| `^https://m1\.openfpcdn\.io/fingerprintjs/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | OSS npm package monitoring ping on the vendor m1.openfpcdn.io host |
| `^https?://[^/?#]+/fpjs/api(?:[/?#]\|$)` | 25% (仅作佐证) | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS |
| `^https://openfpcdn\.io/botd/v[0-9]+(?:[/?#]\|$)` | 100% | BotD bot detection library on the vendor openfpcdn.io host (botd/v1, botd/v2) |
| `^https://m1\.openfpcdn\.io/botd/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | BotD npm package monitoring ping on the vendor m1.openfpcdn.io host |

### 页面和脚本内容

在页面或其脚本中发现的文本。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `FingerprintJS` | 10% | Script reference to the FingerprintJS agent global |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `FingerprintJS (typeof object)` | 45% | FingerprintJS agent global object |
| `__fpjs_pvid (typeof string)` | 40% | Page-visit id the FingerprintJS Pro agent stores on window |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Pro agent loader with the agent global | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host和FingerprintJS agent global object |
| Open-source library with the agent global | 75% | FingerprintJS open-source library on the vendor openfpcdn.io host和FingerprintJS agent global object |
| First-party proxy endpoint with agent evidence | 85% | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS和(FingerprintJS agent global object或Script reference to the FingerprintJS agent global或Page-visit id the FingerprintJS Pro agent stores on window) |
| Bundled npm library with agent evidence | 75% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own和(FingerprintJS agent global object或Script reference to the FingerprintJS agent global或OSS npm package monitoring ping on the vendor m1.openfpcdn.io host) |
| Pro agent calling the vendor API with agent evidence | 85% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional)和(FingerprintJS agent global object或Script reference to the FingerprintJS agent global或Page-visit id the FingerprintJS Pro agent stores on window) |
| npm Pro loader with calls to the vendor API | 85% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net和FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| CDN Pro loader with the agent's page-visit id | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host和Page-visit id the FingerprintJS Pro agent stores on window |
| First-party proxied Pro agent with its page-visit id | 80% | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter和Page-visit id the FingerprintJS Pro agent stores on window |
| Pro agent loader, agent global and script reference | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host和FingerprintJS agent global object和Script reference to the FingerprintJS agent global |

## 难度

**低.** 低表示扩展将这种防护评为较轻的障碍：它通常只过滤简单的客户端，真实浏览器或格式规范的类浏览器请求往往可以通过。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 FingerprintJS，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 FingerprintJS 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 FingerprintJS，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
