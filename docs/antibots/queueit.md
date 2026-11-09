**English** | [Español](es/queueit.md) | [Русский](ru/queueit.md) | [简体中文](zh-CN/queueit.md) | [日本語](ja/queueit.md) | [Português (Brasil)](pt-BR/queueit.md) | [Deutsch](de/queueit.md) | [Français](fr/queueit.md) | [한국어](ko/queueit.md)

# Queue-it bot protection: how to detect it (and what it means for scraping)

Queue-it is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a Queue-it bypass, trying to detect Queue-it on a site, or investigating web scraping blocked by Queue-it, the first step is the same: confirm that Queue-it is really what answers your requests. This page lists the 9 public signals that the Scrapfly Antibot Detector extension uses to recognise Queue-it bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

Queue-it is a virtual waiting room service. It sends visitors to a queue page when a site is overloaded, for example during a ticket or product sale. It controls traffic rather than detecting bots, though it also offers bot filtering options.

Official site: [https://queue-it.com/](https://queue-it.com/)

## How to tell a site uses Queue-it

These signals are generated from the extension's own detection rules for `detect-queueit` (rule version 2.0.0, last updated 2026-10-26). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Cookies

Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^QueueITAccepted-SDFrts345E-V3_` | 60% | Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue |
| `^Queue-it-visitorsession$` | 100% | Queue-it-visitorsession cookie set by the queue page |

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https?://static\.queue-it\.net/script/(?:queueclient\|queueconfigloader)(?:\.min)?\.js(?:[?#]\|$)` | 100% | Queue-it JavaScript connector loaded from static.queue-it.net |
| `^https?://assets\.queue-it\.net/[a-z0-9_-]+/integrationconfig/javascript/queueclientConfig\.js` | 100% | Queue-it integration config requested from assets.queue-it.net |
| `^https?://assets\.queue-it\.net/static/QueueFront/` | 100% | Queue page scripts and images from assets.queue-it.net/static/QueueFront/ |
| `^https?://(?!(?:go\|static\|assets\|www)\.)[a-z0-9-]+\.queue-it\.net/` | 100% | Queue-it queue page on a customer subdomain of queue-it.net |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?queueittoken=` | 40% (corroboration only) | queueittoken parameter in the page address after leaving the queue |

### JavaScript globals (window)

Properties the page's own JavaScript context exposes on `window`.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `QueueIt.Javascript (typeof object)` | 60% | QueueIt.Javascript object created by the Queue-it connector |

### DOM elements

Elements matched by CSS selector.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `script[data-queueit-c]` | 50% | Queue-it connector script tag with its data-queueit-c customer attribute |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Connector script with its runtime or tag | 100% | (Queue-it JavaScript connector loaded from static.queue-it.net or Queue-it integration config requested from assets.queue-it.net) and (QueueIt.Javascript object created by the Queue-it connector or Queue-it connector script tag with its data-queueit-c customer attribute) |
| Queue page with its scripts or session cookie | 100% | Queue-it queue page on a customer subdomain of queue-it.net and (Queue page scripts and images from assets.queue-it.net/static/QueueFront/ or Queue-it-visitorsession cookie set by the queue page) |
| Back from the queue with its token or cookie | 90% | (queueittoken parameter in the page address after leaving the queue or Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue) and (Queue-it JavaScript connector loaded from static.queue-it.net or Queue-it integration config requested from assets.queue-it.net or QueueIt.Javascript object created by the Queue-it connector or Queue-it connector script tag with its data-queueit-c customer attribute) |
| Connector tag with the Queue-it runtime | 85% | Queue-it connector script tag with its data-queueit-c customer attribute and QueueIt.Javascript object created by the Queue-it connector |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If Queue-it is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by Queue-it without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists Queue-it with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
