[English](../fastly.md) | [Español](../es/fastly.md) | [Русский](../ru/fastly.md) | [简体中文](../zh-CN/fastly.md) | **日本語** | [Português (Brasil)](../pt-BR/fastly.md) | [Deutsch](../de/fastly.md) | [Français](../fr/fastly.md) | [한국어](../ko/fastly.md)

# Fastly Bot Management のボット対策: 検出方法とスクレイピングへの影響

Fastly Bot Management は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Fastly Bot Management の回避方法を調べている場合も、サイトで Fastly Bot Management を検出したい場合も、Fastly Bot Management によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Fastly Bot Management かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Fastly Bot Management のボット検出を見分けるために使う 6 件の公開シグナルと、それぞれがどの程度 Fastly Bot Management を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Fastly Bot Management は、エッジクラウドプロバイダー Fastly のボット検出製品です。Fastly のエッジネットワーク経由で提供され、その検出ルールによれば、クライアント側のチェックを実行することもあります。

公式サイト: [https://www.fastly.com/products/bot-management](https://www.fastly.com/products/bot-management)

## サイトが Fastly Bot Management を使っているかを見分ける方法

これらのシグナルは、`detect-fastly` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^_fs_ch_st_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge start cookie (_fs_ch_st_<random>) |
| `^_fs_ch_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge complete cookie (_fs_ch_cp_<random>) |
| `^_fs_cd_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/challenge\.js(?:[?#]\|$)` | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/assets/[A-Za-z0-9_.-]{1,64}\.js(?:[?#]\|$)` | 100% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `div.fastly-challenge` | 40% | Embedded Fastly dynamic challenge container (div.fastly-challenge) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Fastly challenge script with its cookie or container | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path および (Fastly challenge start cookie (_fs_ch_st_<random>) または Fastly challenge complete cookie (_fs_ch_cp_<random>) または Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly challenge complete cookie with its start cookie or container | 95% | Fastly challenge complete cookie (_fs_ch_cp_<random>) および (Fastly challenge start cookie (_fs_ch_st_<random>) または Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly detection script with its cookie | 95% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path および Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |
| Fastly challenge container with its start cookie | 90% | Embedded Fastly dynamic challenge container (div.fastly-challenge) および Fastly challenge start cookie (_fs_ch_st_<random>) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Fastly Bot Management が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Fastly Bot Management で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Fastly Bot Management が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
