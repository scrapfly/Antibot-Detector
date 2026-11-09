[English](../deepseek-pow.md) | [Español](../es/deepseek-pow.md) | [Русский](../ru/deepseek-pow.md) | **简体中文** | [日本語](../ja/deepseek-pow.md) | [Português (Brasil)](../pt-BR/deepseek-pow.md) | [Deutsch](../de/deepseek-pow.md) | [Français](../fr/deepseek-pow.md) | [한국어](../ko/deepseek-pow.md)

# DeepSeek PoW 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

DeepSeek PoW 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 DeepSeek PoW 绕过方法、想检测某个网站是否使用了 DeepSeek PoW，还是在排查网页抓取被 DeepSeek PoW 拦截的问题，第一步都是一样的：确认响应你请求的确实是 DeepSeek PoW。本页列出 Scrapfly Antibot Detector 扩展用来识别 DeepSeek PoW 机器人检测的 5 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

DeepSeek 的聊天网页应用在接受聊天请求之前，会要求浏览器先解出一个工作量证明（proof-of-work）质询。这是该服务自己的防护，而不是出售给其他网站的产品。

官方网站: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## 如何判断网站使用了 DeepSeek PoW

这些特征由扩展自身针对 `detect-deepseek-pow` 的检测规则生成（规则版本 2.1.1，最后更新于 2026-11-04）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (仅作佐证) | Chat completion request, the path the proof of work is issued for |

### 请求和响应数据

页面发送到匹配地址或从该地址接收的数据。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge)和Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge)和Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm)和Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm)和Chat completion request, the path the proof of work is issued for |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 DeepSeek PoW，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 DeepSeek PoW 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 DeepSeek PoW，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
