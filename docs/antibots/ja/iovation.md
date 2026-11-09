[English](../iovation.md) | [Español](../es/iovation.md) | [Русский](../ru/iovation.md) | [简体中文](../zh-CN/iovation.md) | **日本語** | [Português (Brasil)](../pt-BR/iovation.md) | [Deutsch](../de/iovation.md) | [Français](../fr/iovation.md) | [한국어](../ko/iovation.md)

# iovation (TransUnion TruValidate) のボット対策: 検出方法とスクレイピングへの影響

iovation (TransUnion TruValidate) は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。iovation (TransUnion TruValidate) の回避方法を調べている場合も、サイトで iovation (TransUnion TruValidate) を検出したい場合も、iovation (TransUnion TruValidate) によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に iovation (TransUnion TruValidate) かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が iovation (TransUnion TruValidate) のボット検出を見分けるために使う 9 件の公開シグナルと、それぞれがどの程度 iovation (TransUnion TruValidate) を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

iovation は、現在 TransUnion の TruValidate の一部となっているデバイス認識および不正対策サービスです。スクリプトがデバイスのブラックボックスを収集し、サイトは重要な操作とともにそれを送信します。

公式サイト: [https://www.iovation.com/](https://www.iovation.com/)

## サイトが iovation (TransUnion TruValidate) を使っているかを見分ける方法

これらのシグナルは、`detect-iovation` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (補強のみ) | iovation logo.js served through the site's own /iojs/ proxy |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (補強のみ) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (補強のみ) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (補強のみ) | io_global_object_name setting read by the iovation scripts |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (補強のみ) | Hidden ioBlackBox field that receives the iovation blackbox |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) または iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) および (IGLOO.getBlackbox function of the iovation loader または IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy または iovation logo.js served through the site's own /iojs/ proxy) および (IGLOO.getBlackbox function of the iovation loader または IGLOO.fp object created by the iovation profiling scripts または io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader または IGLOO.fp object created by the iovation profiling scripts) および (io_global_object_name setting read by the iovation scripts または iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) または Hidden ioBlackBox field that receives the iovation blackbox) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

iovation (TransUnion TruValidate) が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

iovation (TransUnion TruValidate) で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに iovation (TransUnion TruValidate) が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
