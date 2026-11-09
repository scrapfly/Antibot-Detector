# DeepSeek PoW bot protection: how to detect it (and what it means for scraping)

DeepSeek PoW is a bot protection or anti-abuse layer that some websites put in front of their pages. If you are looking for a DeepSeek PoW bypass, trying to detect DeepSeek PoW on a site, or investigating web scraping blocked by DeepSeek PoW, the first step is the same: confirm that DeepSeek PoW is really what answers your requests. This page lists the 5 public signals that the Scrapfly Antibot Detector extension uses to recognise DeepSeek PoW bot detection, how strongly each one points to it, and what that usually means for an automated client.

## What it is

DeepSeek's chat web app asks the browser to solve a proof-of-work challenge before it accepts a chat request. It is the service's own protection rather than a product sold to other sites.

Official site: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## How to tell a site uses DeepSeek PoW

These signals are generated from the extension's own detection rules for `detect-deepseek-pow` (rule version 2.1.1, last updated 2026-11-04). A signal is only an indication: confidence is how sure the extension is when that one signal is seen. Signals marked "corroboration only" never count on their own, because other products can produce them too.

### Script and request URLs

Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (corroboration only) | Chat completion request, the path the proof of work is issued for |

### Request and response payloads

Data the page sends to, or receives from, a matching address.

| Signal | Confidence | What it indicates |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### Combinations

Some signals score higher together than alone. These combinations are what the extension also reports.

| Combination | Confidence | Needs |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) and Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) and Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) and Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) and Chat completion request, the path the proof of work is issued for |

## Difficulty

**Medium.** Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.

The rating is the extension's own rule of thumb, not a statement by the vendor, and a site's configuration can make the same product easier or harder.

## What it means for scraping

If DeepSeek PoW is present, a request that does not look like a real, consistent browser session may be challenged, delayed or refused, and the response can be a challenge or block page instead of the content you wanted. What exactly happens depends on how the site owner configured the product, which can differ from one site to the next and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.

To scrape pages protected by DeepSeek PoW without maintaining the workarounds yourself, see Scrapfly's [Anti Scraping Protection documentation](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) and the [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Only scrape what you are allowed to, and respect the site's terms and robots rules.

## Detect it with the extension

Install the free [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) for Chrome, browse to the page, and the popup lists DeepSeek PoW with its confidence, its difficulty and the exact signals that matched. Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).
