[English](../sift.md) | [Español](../es/sift.md) | [Русский](../ru/sift.md) | [简体中文](../zh-CN/sift.md) | **日本語** | [Português (Brasil)](../pt-BR/sift.md) | [Deutsch](../de/sift.md) | [Français](../fr/sift.md) | [한국어](../ko/sift.md)

# Sift のボット対策: 検出方法とスクレイピングへの影響

Sift は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Sift の回避方法を調べている場合も、サイトで Sift を検出したい場合も、Sift によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Sift かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Sift のボット検出を見分けるために使う 6 件の公開シグナルと、それぞれがどの程度 Sift を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Sift はデジタルトラストおよび不正対策のプラットフォームです。ページのスニペットがデバイスとページビューのデータを Sift に報告し、リスクスコアリングに使われます。

公式サイト: [https://sift.com/](https://sift.com/)

## サイトが Sift を使っているかを見分ける方法

これらのシグナルは、`detect-sift` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^__ssid$` | 30% (補強のみ) | __ssid visitor cookie the Sift snippet sets |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://cdn\.(?:sift\|siftscience)\.com/(?:s\|js/s-\d+)\.js(?:[?#]\|$)` | 100% | Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host |
| `^https://hexagon-analytics\.com/images/\d+\.gif\?` | 100% | Sift page-view beacon to hexagon-analytics.com (images/<n>.gif) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_sift\.push\(\s*\[\s*['\"]_setAccount['\"]` | 20% | Sift snippet account call in scripts (_sift.push(['_setAccount', ...])) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_sift (typeof object)` | 30% (補強のみ) | _sift command queue of the Sift snippet |
| `Sift (typeof string)` | 40% (補強のみ) | Sift global the Sift s.js sets once loaded |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Sift script or beacon with its runtime or cookie | 100% | (Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host または Sift page-view beacon to hexagon-analytics.com (images/<n>.gif)) および (_sift command queue of the Sift snippet または Sift global the Sift s.js sets once loaded または __ssid visitor cookie the Sift snippet sets) |
| Sift command queue with the loaded s.js | 80% | _sift command queue of the Sift snippet および Sift global the Sift s.js sets once loaded |
| __ssid cookie with the Sift runtime | 85% | __ssid visitor cookie the Sift snippet sets および (_sift command queue of the Sift snippet または Sift global the Sift s.js sets once loaded または Sift snippet account call in scripts (_sift.push(['_setAccount', ...]))) |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Sift が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Sift で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Sift が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
