[English](../meetrics.md) | [Español](../es/meetrics.md) | [Русский](../ru/meetrics.md) | [简体中文](../zh-CN/meetrics.md) | **日本語** | [Português (Brasil)](../pt-BR/meetrics.md) | [Deutsch](../de/meetrics.md) | [Français](../fr/meetrics.md) | [한국어](../ko/meetrics.md)

# Meetrics Check のボット対策: 検出方法とスクレイピングへの影響

Meetrics Check は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Meetrics Check の回避方法を調べている場合も、サイトで Meetrics Check を検出したい場合も、Meetrics Check によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Meetrics Check かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Meetrics Check のボット検出を見分けるために使う 4 件の公開シグナルと、それぞれがどの程度 Meetrics Check を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Meetrics は、広告のビューアビリティや広告不正の計測タグを提供してきたメディア計測企業です。この検出は、同社のスクリプトを今も参照している古い連携を検知しますが、すでに動作していない可能性があります。

公式サイト: [https://www.meetrics.com/en/](https://www.meetrics.com/en/)

## サイトが Meetrics Check を使っているかを見分ける方法

これらのシグナルは、`detect-meetrics` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.0、最終更新日 2026-10-17）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}mxcdn\.net/bb-mx/serve/mtrcs_[0-9]+\.js(?:[?#]\|$)` | 40% | Legacy Meetrics tag (mxcdn.net, now parked) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}meetrics\.(?:com\|net)/` | 20% (補強のみ) | Legacy meetrics.com/.net host |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `meetricsGlobal` | 5% | Meetrics global reference in scripts |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `meetricsGlobal (typeof object)` | 40% | Meetrics global object |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Legacy tag with its runtime | 60% | Legacy Meetrics tag (mxcdn.net, now parked) および Meetrics global object |
| Meetrics host traffic with its runtime | 50% | Legacy meetrics.com/.net host および (Meetrics global object または Meetrics global reference in scripts) |
| Legacy tag referenced in page scripts | 45% | Legacy Meetrics tag (mxcdn.net, now parked) および Meetrics global reference in scripts |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Meetrics Check が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Meetrics Check で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Meetrics Check が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
