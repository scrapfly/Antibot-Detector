[English](../seon.md) | [Español](../es/seon.md) | [Русский](../ru/seon.md) | [简体中文](../zh-CN/seon.md) | **日本語** | [Português (Brasil)](../pt-BR/seon.md) | [Deutsch](../de/seon.md) | [Français](../fr/seon.md) | [한국어](../ko/seon.md)

# SEON のボット対策: 検出方法とスクレイピングへの影響

SEON は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。SEON の回避方法を調べている場合も、サイトで SEON を検出したい場合も、SEON によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に SEON かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が SEON のボット検出を見分けるために使う 7 件の公開シグナルと、それぞれがどの程度 SEON を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

SEON は不正対策企業です。JavaScript エージェントがデバイスとネットワークのシグナルを収集し、リスクスコアリングに利用されます。

公式サイト: [https://seon.io/](https://seon.io/)

## サイトが SEON を使っているかを見分ける方法

これらのシグナルは、`detect-seon` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://cdn\.(?:seondf\|dfsdk\|deviceinf\|seonintelligence)\.com/js/v\d+/agent(?:\.umd)?\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts |
| `^https://cdn\.seon\.io/js/v\d+/agent\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host |
| `^https://[0-9a-f]{16,64}\.seondnsresolve\.com/` | 100% | SEON agent network probe to a seondnsresolve.com host |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `\bseon\.(?:getSession\|getBase64Session\|config)\s*\(` | 20% (補強のみ) | SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `seon.getSession (typeof function)` | 60% | seon.getSession function of the SEON v6 agent |
| `seon.getBase64Session (typeof function)` | 60% | seon.getBase64Session function of the SEON v5 agent |
| `webpackChunkseon_javascript_sdk (exists)` | 50% (補強のみ) | webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| SEON agent from its host with its runtime | 100% | (SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts または SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host または SEON agent network probe to a seondnsresolve.com host) および (seon.getSession function of the SEON v6 agent または seon.getBase64Session function of the SEON v5 agent または webpackChunkseon_javascript_sdk global left by the SEON v5 agent) |
| SEON agent with its calls | 85% | (seon.getSession function of the SEON v6 agent または seon.getBase64Session function of the SEON v5 agent または webpackChunkseon_javascript_sdk global left by the SEON v5 agent) および SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |
| SEON v5 agent function with its runtime | 80% | seon.getBase64Session function of the SEON v5 agent および webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

SEON が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

SEON で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに SEON が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
