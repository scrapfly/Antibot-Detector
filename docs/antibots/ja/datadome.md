[English](../datadome.md) | [Español](../es/datadome.md) | [Русский](../ru/datadome.md) | [简体中文](../zh-CN/datadome.md) | **日本語** | [Português (Brasil)](../pt-BR/datadome.md) | [Deutsch](../de/datadome.md) | [Français](../fr/datadome.md) | [한국어](../ko/datadome.md)

# DataDome のボット対策: 検出方法とスクレイピングへの影響

DataDome は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。DataDome の回避方法を調べている場合も、サイトで DataDome を検出したい場合も、DataDome によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に DataDome かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が DataDome のボット検出を見分けるために使う 11 件の公開シグナルと、それぞれがどの程度 DataDome を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

DataDome はフランスのボットおよびオンライン不正対策ベンダーです。JavaScript タグとサーバー側のシグナルでリクエストをスコアリングし、チャレンジまたはブロックページで応答することがあります。

公式サイト: [https://datadome.co/](https://datadome.co/)

## サイトが DataDome を使っているかを見分ける方法

これらのシグナルは、`detect-datadome` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.0、最終更新日 2026-10-16）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (補強のみ) | DataDome block-type header on challenge responses |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/(?:tags\.js\|js/)` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:geo\|ct\|c\|t)\.captcha-delivery\.com/` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (補強のみ) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (補強のみ) | DataDome block page bootstrap (var dd={'rt':...}) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint または DataDome JS key set by the integration snippet または Integration snippet setting window.ddjskey) および DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header または DataDome protection response header または Response served by DataDome itself (block or challenge page)) および DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only および (DataDome JS key set by the integration snippet または Integration snippet setting window.ddjskey) |
| DataDome block page | 95% | DataDome block page bootstrap (var dd={'rt':...}) および (DataDome client ID response header または DataDome block-type header on challenge responses または DataDome challenge or CAPTCHA delivery host または DataDome session cookie) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

DataDome が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

DataDome で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに DataDome が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
