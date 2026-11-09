[English](../fingerprintjs.md) | [Español](../es/fingerprintjs.md) | [Русский](../ru/fingerprintjs.md) | [简体中文](../zh-CN/fingerprintjs.md) | **日本語** | [Português (Brasil)](../pt-BR/fingerprintjs.md) | [Deutsch](../de/fingerprintjs.md) | [Français](../fr/fingerprintjs.md) | [한국어](../ko/fingerprintjs.md)

# FingerprintJS のボット対策: 検出方法とスクレイピングへの影響

FingerprintJS は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。FingerprintJS の回避方法を調べている場合も、サイトで FingerprintJS を検出したい場合も、FingerprintJS によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に FingerprintJS かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が FingerprintJS のボット検出を見分けるために使う 13 件の公開シグナルと、それぞれがどの程度 FingerprintJS を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

FingerprintJS はブラウザフィンガープリントのライブラリで、オープンソース版と、Fingerprint の商用 Pro サービスがあります。BotD ライブラリは、これとは別のオープンソースのボット検出ツールです。これが見つかっても分かるのはサイトがデバイスのシグナルを収集していることであり、必ずしもボットをブロックしているわけではありません。

公式サイト: [https://fingerprint.com/](https://fingerprint.com/)

## サイトが FingerprintJS を使っているかを見分ける方法

これらのシグナルは、`detect-fingerprintjs` に対する拡張機能自身の検出ルール（ルールのバージョン 2.3.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.){0,2}fpcdn\.io/v[34](?:[/?#]\|$)` | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host |
| `^https://openfpcdn\.io/fingerprintjs/v[0-9]+(?:[/?#]\|$)` | 100% | FingerprintJS open-source library on the vendor openfpcdn.io host |
| `^https://fpnpmcdn\.net/v[34]/[A-Za-z0-9]+/loader_v\d+\.\d+\.\d+\.js(?:[?#]\|$)` | 100% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net |
| `^https://(?:[a-z0-9-]+\.)?api\.fpjs\.(?:io\|sh\|pro)(?:[/?#]\|$)` | 100% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?ci=jsl?/[34]\.\d+\.\d+(?:[&#]\|$)` | 30% (補強のみ) | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter |
| `^https?://[^/?#]+/(?:[^?#]*/)?fp\.(?:esm\|umd\|cjs)(?:\.[A-Za-z0-9_-]{6,})?\.js(?:[?#]\|$)` | 50% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own |
| `^https://m1\.openfpcdn\.io/fingerprintjs/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | OSS npm package monitoring ping on the vendor m1.openfpcdn.io host |
| `^https?://[^/?#]+/fpjs/api(?:[/?#]\|$)` | 25% (補強のみ) | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS |
| `^https://openfpcdn\.io/botd/v[0-9]+(?:[/?#]\|$)` | 100% | BotD bot detection library on the vendor openfpcdn.io host (botd/v1, botd/v2) |
| `^https://m1\.openfpcdn\.io/botd/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | BotD npm package monitoring ping on the vendor m1.openfpcdn.io host |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `FingerprintJS` | 10% | Script reference to the FingerprintJS agent global |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `FingerprintJS (typeof object)` | 45% | FingerprintJS agent global object |
| `__fpjs_pvid (typeof string)` | 40% | Page-visit id the FingerprintJS Pro agent stores on window |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Pro agent loader with the agent global | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host および FingerprintJS agent global object |
| Open-source library with the agent global | 75% | FingerprintJS open-source library on the vendor openfpcdn.io host および FingerprintJS agent global object |
| First-party proxy endpoint with agent evidence | 85% | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS および (FingerprintJS agent global object または Script reference to the FingerprintJS agent global または Page-visit id the FingerprintJS Pro agent stores on window) |
| Bundled npm library with agent evidence | 75% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own および (FingerprintJS agent global object または Script reference to the FingerprintJS agent global または OSS npm package monitoring ping on the vendor m1.openfpcdn.io host) |
| Pro agent calling the vendor API with agent evidence | 85% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) および (FingerprintJS agent global object または Script reference to the FingerprintJS agent global または Page-visit id the FingerprintJS Pro agent stores on window) |
| npm Pro loader with calls to the vendor API | 85% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net および FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| CDN Pro loader with the agent's page-visit id | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host および Page-visit id the FingerprintJS Pro agent stores on window |
| First-party proxied Pro agent with its page-visit id | 80% | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter および Page-visit id the FingerprintJS Pro agent stores on window |
| Pro agent loader, agent global and script reference | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host および FingerprintJS agent global object および Script reference to the FingerprintJS agent global |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

FingerprintJS が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

FingerprintJS で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに FingerprintJS が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
