[English](../castle.md) | [Español](../es/castle.md) | [Русский](../ru/castle.md) | [简体中文](../zh-CN/castle.md) | **日本語** | [Português (Brasil)](../pt-BR/castle.md) | [Deutsch](../de/castle.md) | [Français](../fr/castle.md) | [한국어](../ko/castle.md)

# Castle のボット対策: 検出方法とスクレイピングへの影響

Castle は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Castle の回避方法を調べている場合も、サイトで Castle を検出したい場合も、Castle によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Castle かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Castle のボット検出を見分けるために使う 6 件の公開シグナルと、それぞれがどの程度 Castle を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Castle は、アカウント乗っ取り、ボット、不正利用への対策を提供するセキュリティベンダーです。ブラウザ側のスクリプトがリクエストトークンを生成し、サイトはログインや重要な操作と合わせてそれを Castle の API に送信します。

公式サイト: [https://castle.io/](https://castle.io/)

## サイトが Castle を使っているかを見分ける方法

これらのシグナルは、`detect-castle` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.1、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^__cuid$` | 30% | __cuid device cookie Castle.js stores by default |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://cdn\.castle\.io/v2/castle\.js(?:[?#]\|$)` | 100% | Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) |
| `^https://m\.castle\.io/v1/monitor(?:[/?#]\|$)` | 100% | Castle.js event request to the vendor m.castle.io monitor endpoint |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `Castle.createRequestToken (typeof function)` | 60% | Castle.createRequestToken function of the Castle.js global |
| `Castle.injectTokenOnSubmit (typeof function)` | 50% (補強のみ) | Castle.injectTokenOnSubmit form helper of the Castle.js global |
| `_castle (typeof function)` | 30% (補強のみ) | _castle function set by the CDN castle.js |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Castle.js from its host with its cookie or global | 100% | (Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) または Castle.js event request to the vendor m.castle.io monitor endpoint) および (__cuid device cookie Castle.js stores by default または Castle.createRequestToken function of the Castle.js global または _castle function set by the CDN castle.js) |
| __cuid cookie with Castle.js | 90% | __cuid device cookie Castle.js stores by default および (Castle.createRequestToken function of the Castle.js global または Castle.injectTokenOnSubmit form helper of the Castle.js global または _castle function set by the CDN castle.js または Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) または Castle.js event request to the vendor m.castle.io monitor endpoint) |
| Castle.js global with its helpers | 80% | Castle.createRequestToken function of the Castle.js global および Castle.injectTokenOnSubmit form helper of the Castle.js global |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Castle が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Castle で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Castle が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
