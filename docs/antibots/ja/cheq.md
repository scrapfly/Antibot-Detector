[English](../cheq.md) | [Español](../es/cheq.md) | [Русский](../ru/cheq.md) | [简体中文](../zh-CN/cheq.md) | **日本語** | [Português (Brasil)](../pt-BR/cheq.md) | [Deutsch](../de/cheq.md) | [Français](../fr/cheq.md) | [한국어](../ko/cheq.md)

# Cheq のボット対策: 検出方法とスクレイピングへの影響

Cheq は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Cheq の回避方法を調べている場合も、サイトで Cheq を検出したい場合も、Cheq によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Cheq かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Cheq のボット検出を見分けるために使う 12 件の公開シグナルと、それぞれがどの程度 Cheq を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

CHEQ は、主に広告やマーケティングのトラフィックを対象に、ボット、無効トラフィック、不正行為の防止を提供する go-to-market セキュリティ企業です。

公式サイト: [https://cheq.ai/](https://cheq.ai/)

## サイトが Cheq を使っているかを見分ける方法

これらのシグナルは、`detect-cheq` に対する拡張機能自身の検出ルール（ルールのバージョン 2.2.0、最終更新日 2026-10-17）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (補強のみ) | Other CHEQ cookies |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (補強のみ) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (補強のみ) | CHEQ queue object (_cq) |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class または CHEQ tag with its JSONP callback attribute または CHEQ ClickTrue host (cheqzone.com)) および (CHEQ SDK global または CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie または Other CHEQ cookies) および (CHEQ queue object (_cq) または CHEQ JSONP callback name または CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host および (CHEQ visitor/session id cookie または Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai) および (CHEQ SDK global または CHEQ queue object (_cq) または CHEQ visitor/session id cookie または Other CHEQ cookies)) または ((ClickTrue tag; served from a disguised random host, identified by its class または CHEQ tag with its JSONP callback attribute または CHEQ ClickTrue host (cheqzone.com)) および (CHEQ queue object (_cq) または Other CHEQ cookies)) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Cheq が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Cheq で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Cheq が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
