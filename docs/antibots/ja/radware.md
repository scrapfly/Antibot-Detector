[English](../radware.md) | [Español](../es/radware.md) | [Русский](../ru/radware.md) | [简体中文](../zh-CN/radware.md) | **日本語** | [Português (Brasil)](../pt-BR/radware.md) | [Deutsch](../de/radware.md) | [Français](../fr/radware.md) | [한국어](../ko/radware.md)

# Radware Bot Manager のボット対策: 検出方法とスクレイピングへの影響

Radware Bot Manager は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Radware Bot Manager の回避方法を調べている場合も、サイトで Radware Bot Manager を検出したい場合も、Radware Bot Manager によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Radware Bot Manager かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Radware Bot Manager のボット検出を見分けるために使う 10 件の公開シグナルと、それぞれがどの程度 Radware Bot Manager を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Radware Bot Manager（旧 ShieldSquare）は Radware のボット管理製品です。Radware はクラウド WAF も販売しており、この検出は両方の痕跡を探します。

公式サイト: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## サイトが Radware Bot Manager を使っているかを見分ける方法

これらのシグナルは、`detect-radware` に対する拡張機能自身の検出ルール（ルールのバージョン 2.3.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (補強のみ) | Radware Bot Manager cookies written by its JavaScript |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `CloudWebSec[.@]radware\.com` | 20% (補強のみ) | CloudWebSec contact address on the Radware block page |
| `Unauthorized Request Blocked` | 20% (補強のみ) | Radware block-page message |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | CloudWebSec contact address on the Radware block page および Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header および (CloudWebSec contact address on the Radware block page または Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header および CloudWebSec contact address on the Radware block page および Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) および First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) および First-party Radware Bot Manager script (stormcaster.js) および Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host および Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge および (Radware Bot Manager session cookies (__uzma … __uzmf) または Radware Bot Manager cookies written by its JavaScript) |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Radware Bot Manager が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Radware Bot Manager で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Radware Bot Manager が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
