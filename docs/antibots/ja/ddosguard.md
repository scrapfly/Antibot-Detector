[English](../ddosguard.md) | [Español](../es/ddosguard.md) | [Русский](../ru/ddosguard.md) | [简体中文](../zh-CN/ddosguard.md) | **日本語** | [Português (Brasil)](../pt-BR/ddosguard.md) | [Deutsch](../de/ddosguard.md) | [Français](../fr/ddosguard.md) | [한국어](../ko/ddosguard.md)

# DDoS-Guard のボット対策: 検出方法とスクレイピングへの影響

DDoS-Guard は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。DDoS-Guard の回避方法を調べている場合も、サイトで DDoS-Guard を検出したい場合も、DDoS-Guard によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に DDoS-Guard かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が DDoS-Guard のボット検出を見分けるために使う 4 件の公開シグナルと、それぞれがどの程度 DDoS-Guard を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

DDoS-Guard は、リバースプロキシとして動作するホスティングおよび DDoS 対策プロバイダーです。確認したい訪問者にブラウザチェックを表示することがあります。

公式サイト: [https://ddos-guard.net/](https://ddos-guard.net/)

## サイトが DDoS-Guard を使っているかを見分ける方法

これらのシグナルは、`detect-ddosguard` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^__ddg(?:[0-9]{1,2}\|id\|mark)_$` | 100% | DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^server$: ^ddos-guard$` | 100% | DDoS-Guard server header |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/ddos-guard/(?:check\|js-challenge/\|id/)` | 100% | DDoS-Guard check scripts under /.well-known/ddos-guard/ |
| `^https?://check\.ddos-guard\.net/` | 100% | Request to check.ddos-guard.net |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| DDoS-Guard server with its cookies | 100% | DDoS-Guard server header および DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |
| Browser check script on a DDoS-Guard response | 100% | (DDoS-Guard check scripts under /.well-known/ddos-guard/ または Request to check.ddos-guard.net) および (DDoS-Guard server header または DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies)) |
| Check scripts on the site and on check.ddos-guard.net | 95% | DDoS-Guard check scripts under /.well-known/ddos-guard/ および Request to check.ddos-guard.net |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

DDoS-Guard が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

DDoS-Guard で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに DDoS-Guard が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
