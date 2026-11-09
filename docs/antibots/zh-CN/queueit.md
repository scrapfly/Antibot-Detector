[English](../queueit.md) | [Español](../es/queueit.md) | [Русский](../ru/queueit.md) | **简体中文** | [日本語](../ja/queueit.md) | [Português (Brasil)](../pt-BR/queueit.md) | [Deutsch](../de/queueit.md) | [Français](../fr/queueit.md) | [한국어](../ko/queueit.md)

# Queue-it 反爬防护：如何检测网站是否使用它（以及它对网页抓取意味着什么）

Queue-it 是一些网站放在页面前面的反爬虫（反机器人）或反滥用防护层。无论你是在寻找 Queue-it 绕过方法、想检测某个网站是否使用了 Queue-it，还是在排查网页抓取被 Queue-it 拦截的问题，第一步都是一样的：确认响应你请求的确实是 Queue-it。本页列出 Scrapfly Antibot Detector 扩展用来识别 Queue-it 机器人检测的 9 个公开特征，说明每个特征指向它的可信程度，以及这通常对自动化客户端意味着什么。

## 它是什么

Queue-it 是一项虚拟等候室服务。当网站过载时，例如在门票或商品开售期间，它会把访客送到排队页面。它控制的是流量而不是检测机器人，不过也提供机器人过滤选项。

官方网站: [https://queue-it.com/](https://queue-it.com/)

## 如何判断网站使用了 Queue-it

这些特征由扩展自身针对 `detect-queueit` 的检测规则生成（规则版本 2.0.0，最后更新于 2026-10-26）。单个特征只是一种迹象：置信度表示扩展在看到该特征时有多大把握。标记为“仅作佐证”的特征本身不计入判断，因为其他产品也可能产生它们。

### Cookie

页面上设置的 Cookie 名称（匹配到值时也包括值）。除非是普通单词，否则匹配模式均为正则表达式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^QueueITAccepted-SDFrts345E-V3_` | 60% | Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue |
| `^Queue-it-visitorsession$` | 100% | Queue-it-visitorsession cookie set by the queue page |

### 脚本和请求 URL

页面加载的脚本、框架和请求的地址。这些是针对完整地址进行匹配的模式。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `^https?://static\.queue-it\.net/script/(?:queueclient\|queueconfigloader)(?:\.min)?\.js(?:[?#]\|$)` | 100% | Queue-it JavaScript connector loaded from static.queue-it.net |
| `^https?://assets\.queue-it\.net/[a-z0-9_-]+/integrationconfig/javascript/queueclientConfig\.js` | 100% | Queue-it integration config requested from assets.queue-it.net |
| `^https?://assets\.queue-it\.net/static/QueueFront/` | 100% | Queue page scripts and images from assets.queue-it.net/static/QueueFront/ |
| `^https?://(?!(?:go\|static\|assets\|www)\.)[a-z0-9-]+\.queue-it\.net/` | 100% | Queue-it queue page on a customer subdomain of queue-it.net |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?queueittoken=` | 40% (仅作佐证) | queueittoken parameter in the page address after leaving the queue |

### JavaScript 全局变量（window）

页面自身的 JavaScript 上下文在 `window` 上暴露的属性。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `QueueIt.Javascript (typeof object)` | 60% | QueueIt.Javascript object created by the Queue-it connector |

### DOM 元素

通过 CSS 选择器匹配的元素。

| 特征 | 置信度 | 含义 |
| --- | --- | --- |
| `script[data-queueit-c]` | 50% | Queue-it connector script tag with its data-queueit-c customer attribute |

### 组合特征

有些特征组合在一起的得分比单独出现时更高。扩展也会报告这些组合。

| 组合 | 置信度 | 条件 |
| --- | --- | --- |
| Connector script with its runtime or tag | 100% | (Queue-it JavaScript connector loaded from static.queue-it.net或Queue-it integration config requested from assets.queue-it.net)和(QueueIt.Javascript object created by the Queue-it connector或Queue-it connector script tag with its data-queueit-c customer attribute) |
| Queue page with its scripts or session cookie | 100% | Queue-it queue page on a customer subdomain of queue-it.net和(Queue page scripts and images from assets.queue-it.net/static/QueueFront/或Queue-it-visitorsession cookie set by the queue page) |
| Back from the queue with its token or cookie | 90% | (queueittoken parameter in the page address after leaving the queue或Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue)和(Queue-it JavaScript connector loaded from static.queue-it.net或Queue-it integration config requested from assets.queue-it.net或QueueIt.Javascript object created by the Queue-it connector或Queue-it connector script tag with its data-queueit-c customer attribute) |
| Connector tag with the Queue-it runtime | 85% | Queue-it connector script tag with its data-queueit-c customer attribute和QueueIt.Javascript object created by the Queue-it connector |

## 难度

**中.** 中表示扩展将这种防护评为真正的障碍：预计会检查浏览器、请求细节或两者，并且这些检查会随时间变化。

该评级是扩展自身的经验判断，并非厂商的说法，而且网站的配置可能让同一款产品变得更容易或更难应对。

## 对网页抓取意味着什么

如果存在 Queue-it，不像真实、一致的浏览器会话的请求可能会被质询、延迟或拒绝，返回的响应也可能是质询页或拦截页，而不是你想要的内容。具体会发生什么取决于网站所有者如何配置该产品，不同网站可能各不相同，并且可能在不另行通知的情况下改变。请把检测结果当作查看你实际收到的响应的理由，而不是一定会被拦截的保证。

如果想抓取受 Queue-it 保护的页面而不必自己维护各种应对方案，请参阅 Scrapfly 的 [反抓取防护（Anti Scraping Protection）文档](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) 和 [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)。请只抓取你有权抓取的内容，并遵守网站的服务条款和 robots 规则。

## 使用扩展检测

为 Chrome 安装免费的 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)，然后访问该页面，弹窗会列出 Queue-it，以及它的置信度、难度和匹配到的具体特征。更多信息请阅读 [项目 README](../../README.zh-CN.md)，或查看 [扩展可检测的所有反爬防护](README.md)。
