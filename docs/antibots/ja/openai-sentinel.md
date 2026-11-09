[English](../openai-sentinel.md) | [Español](../es/openai-sentinel.md) | [Русский](../ru/openai-sentinel.md) | [简体中文](../zh-CN/openai-sentinel.md) | **日本語** | [Português (Brasil)](../pt-BR/openai-sentinel.md) | [Deutsch](../de/openai-sentinel.md) | [Français](../fr/openai-sentinel.md) | [한국어](../ko/openai-sentinel.md)

# OpenAI Sentinel のボット対策: 検出方法とスクレイピングへの影響

OpenAI Sentinel は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。OpenAI Sentinel の回避方法を調べている場合も、サイトで OpenAI Sentinel を検出したい場合も、OpenAI Sentinel によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に OpenAI Sentinel かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が OpenAI Sentinel のボット検出を見分けるために使う 11 件の公開シグナルと、それぞれがどの程度 OpenAI Sentinel を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Sentinel は、ChatGPT と OpenAI のサインインで使われる不正利用対策レイヤーの名前です。一部のリクエストの前に、ブラウザにチャレンジを発行します。OpenAI 自身のサービスを保護するもので、他のサイト向けの製品ではありません。

公式サイト: [https://chatgpt.com/](https://chatgpt.com/)

## サイトが OpenAI Sentinel を使っているかを見分ける方法

これらのシグナルは、`detect-openai-sentinel` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.1、最終更新日 2026-11-04）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements(?:/[a-z]{3,12})?(?:[?#]\|$)` | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/sdk\.js(?:[?#]\|$)` | 100% | Sentinel SDK loader (/backend-api/sentinel/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/sentinel/[0-9a-z]{6,24}/sdk\.js(?:[?#]\|$)` | 100% | Versioned Sentinel SDK (/sentinel/<build>/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/frame\.html(?:[?#]\|$)` | 100% | Hidden Sentinel frame (/backend-api/sentinel/frame.html) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/req(?:[?#]\|$)` | 100% | Sentinel token request sent by the SDK (/backend-api/sentinel/req) |
| `^https://chatgpt\.com/(?:[a-z0-9-]{3,20}/)?assets/(?:[a-z]{2,12}-){0,4}sentinel(?:-[a-z]{2,12}){0,3}-[A-Za-z0-9_-]{8}\.js(?:[?#]\|$)` | 70% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `SentinelSDK (typeof object)` | 75% | Sentinel SDK object (window.SentinelSDK) |

### リクエストとレスポンスのペイロード

ページが、条件に一致するアドレスに送信する、またはそこから受信するデータ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/ ; body "p"\s*:\s*"gAAAAAC` | 100% | Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| `URL ^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements/finalize(?:[?#]\|$) ; body "proofofwork"\s*:\s*"gAAAAAB` | 100% | Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "proofofwork"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "so"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for session telemetry (so.required: true) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Chat-requirements request with its requirements token | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work および Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| Proof of work asked for and answered | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) および Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| Sentinel SDK with its frame or token request | 100% | (Sentinel SDK loader (/backend-api/sentinel/sdk.js) または Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) および (Hidden Sentinel frame (/backend-api/sentinel/frame.html) または Sentinel token request sent by the SDK (/backend-api/sentinel/req)) |
| Sentinel SDK object with its script | 90% | Sentinel SDK object (window.SentinelSDK) および (Sentinel SDK loader (/backend-api/sentinel/sdk.js) または Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) |
| ChatGPT Sentinel scripts with Sentinel traffic | 90% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) および (Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint または Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize または Sentinel response asking for a proof of work (proofofwork.required: true)) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

OpenAI Sentinel が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

OpenAI Sentinel で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに OpenAI Sentinel が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
