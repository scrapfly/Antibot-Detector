[English](../ocule.md) | [Español](../es/ocule.md) | [Русский](../ru/ocule.md) | [简体中文](../zh-CN/ocule.md) | **日本語** | [Português (Brasil)](../pt-BR/ocule.md) | [Deutsch](../de/ocule.md) | [Français](../fr/ocule.md) | [한국어](../ko/ocule.md)

# Ocule のボット対策: 検出方法とスクレイピングへの影響

Ocule は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Ocule の回避方法を調べている場合も、サイトで Ocule を検出したい場合も、Ocule によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Ocule かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Ocule のボット検出を見分けるために使う 3 件の公開シグナルと、それぞれがどの程度 Ocule を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Ocule はボット対策サービスで、のちに hCaptcha に吸収されました。今も参照しているページは、一般的に古い連携です。

公式サイト: [https://ocule.io/](https://ocule.io/)

## サイトが Ocule を使っているかを見分ける方法

これらのシグナルは、`detect-ocule` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.0、最終更新日 2026-10-17）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://proxy\.ocule\.co\.uk/script\.js(?:[?#]\|$)` | 40% | Legacy Ocule loader script (host no longer resolves) |
| `^https://(?!proxy\.)(?:[a-z0-9-]{1,63}\.){0,4}ocule\.co\.uk/` | 20% (補強のみ) | Other requests to the legacy ocule.co.uk host (not the loader) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `ocule.co.uk` | 5% | Reference to the legacy Ocule host |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Legacy loader with other Ocule traffic | 60% | Legacy Ocule loader script (host no longer resolves) および Other requests to the legacy ocule.co.uk host (not the loader) |
| Legacy loader referenced in page scripts | 50% | Legacy Ocule loader script (host no longer resolves) および Reference to the legacy Ocule host |
| Legacy Ocule host traffic and reference | 40% | Other requests to the legacy ocule.co.uk host (not the loader) および Reference to the legacy Ocule host |

## 難易度

**高.** 「高」は、拡張機能がこの対策を突破が最も難しいものの一つと評価していることを意味します。通常、クライアント側のチェックと、行動分析またはサーバー側のスコアリングを組み合わせています。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Ocule が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Ocule で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Ocule が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
