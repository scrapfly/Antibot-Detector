[English](../shapesecurity.md) | [Español](../es/shapesecurity.md) | [Русский](../ru/shapesecurity.md) | [简体中文](../zh-CN/shapesecurity.md) | **日本語** | [Português (Brasil)](../pt-BR/shapesecurity.md) | [Deutsch](../de/shapesecurity.md) | [Français](../fr/shapesecurity.md) | [한국어](../ko/shapesecurity.md)

# Shape Security のボット対策: 検出方法とスクレイピングへの影響

Shape Security は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Shape Security の回避方法を調べている場合も、サイトで Shape Security を検出したい場合も、Shape Security によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Shape Security かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Shape Security のボット検出を見分けるために使う 5 件の公開シグナルと、それぞれがどの程度 Shape Security を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Shape Security は F5 に買収された企業で、ログインやチェックアウトのフローにおける不正、クレデンシャルスタッフィング、自動化を対象としたエンタープライズ向けのボット防御を構築しました。

公式サイト: [https://www.shapesecurity.com/products/bot-manager](https://www.shapesecurity.com/products/bot-manager)

## サイトが Shape Security を使っているかを見分ける方法

これらのシグナルは、`detect-shapesecurity` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.0、最終更新日 2026-10-16）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?seed=[A-Za-z0-9_-]{40,}` | 85% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{0,60}/ssx\.mod\.js(?:\?async)?(?:#\|$)` | 60% (補強のみ) | Shape ssx.mod.js loader (Target, Nordstrom) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?X-[A-Za-z0-9]{6,10}--z=q(?:&\|#\|$)` | 50% (補強のみ) | Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `__xr_bmobdb` | 10% | Shape runtime global reference |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `__xr_bmobdb (exists)` | 80% | Shape runtime global (__xr_bmobdb) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Seeded loader with its runtime | 100% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) および (Shape runtime global (__xr_bmobdb) または Shape runtime global reference または Shape seeded-script marker parameter (X-xxxxxxxx--z=q)) |
| ssx.mod.js loader with the Shape runtime | 90% | Shape ssx.mod.js loader (Target, Nordstrom) および (Shape runtime global (__xr_bmobdb) または Shape loader with its long seed parameter (ssx.mod.js?seed=...)) |
| ssx.mod.js loader with the seeded-script marker | 80% | Shape ssx.mod.js loader (Target, Nordstrom) および Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

## 難易度

**高.** 「高」は、拡張機能がこの対策を突破が最も難しいものの一つと評価していることを意味します。通常、クライアント側のチェックと、行動分析またはサーバー側のスコアリングを組み合わせています。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Shape Security が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Shape Security で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Shape Security が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
