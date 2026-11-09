[English](../deepseek-pow.md) | [Español](../es/deepseek-pow.md) | [Русский](../ru/deepseek-pow.md) | [简体中文](../zh-CN/deepseek-pow.md) | **日本語** | [Português (Brasil)](../pt-BR/deepseek-pow.md) | [Deutsch](../de/deepseek-pow.md) | [Français](../fr/deepseek-pow.md) | [한국어](../ko/deepseek-pow.md)

# DeepSeek PoW のボット対策: 検出方法とスクレイピングへの影響

DeepSeek PoW は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。DeepSeek PoW の回避方法を調べている場合も、サイトで DeepSeek PoW を検出したい場合も、DeepSeek PoW によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に DeepSeek PoW かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が DeepSeek PoW のボット検出を見分けるために使う 5 件の公開シグナルと、それぞれがどの程度 DeepSeek PoW を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

DeepSeek のチャット用ウェブアプリは、チャットリクエストを受け付ける前に、ブラウザに Proof-of-Work チャレンジを解かせます。これは他のサイトに販売される製品ではなく、このサービス自身の保護です。

公式サイト: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## サイトが DeepSeek PoW を使っているかを見分ける方法

これらのシグナルは、`detect-deepseek-pow` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.1、最終更新日 2026-11-04）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (補強のみ) | Chat completion request, the path the proof of work is issued for |

### リクエストとレスポンスのペイロード

ページが、条件に一致するアドレスに送信する、またはそこから受信するデータ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) および Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) および Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) および Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) および Chat completion request, the path the proof of work is issued for |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

DeepSeek PoW が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

DeepSeek PoW で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに DeepSeek PoW が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
