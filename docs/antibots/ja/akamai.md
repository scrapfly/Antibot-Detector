[English](../akamai.md) | [Español](../es/akamai.md) | [Русский](../ru/akamai.md) | [简体中文](../zh-CN/akamai.md) | **日本語** | [Português (Brasil)](../pt-BR/akamai.md) | [Deutsch](../de/akamai.md) | [Français](../fr/akamai.md) | [한국어](../ko/akamai.md)

# Akamai Bot Manager のボット対策: 検出方法とスクレイピングへの影響

Akamai Bot Manager は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Akamai Bot Manager の回避方法を調べている場合も、サイトで Akamai Bot Manager を検出したい場合も、Akamai Bot Manager によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Akamai Bot Manager かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Akamai Bot Manager のボット検出を見分けるために使う 20 件の公開シグナルと、それぞれがどの程度 Akamai Bot Manager を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Akamai Bot Manager は、CDN およびセキュリティ企業 Akamai Technologies のボット管理製品です。Akamai のエッジプラットフォームの一部として大規模サイト向けに提供され、人間、善良なボット、悪質な自動化を区別することを目的としています。

公式サイト: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## サイトが Akamai Bot Manager を使っているかを見分ける方法

これらのシグナルは、`detect-akamai` に対する拡張機能自身の検出ルール（ルールのバージョン 2.3.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|s\|so\|lso)$` | 30% (補強のみ) | Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only |
| `^bm_sv$` | 60% | Bot Manager cookie bm_sv, named in Akamai's cookie documentation |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (補強のみ) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (補強のみ) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (補強のみ) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### リクエストとレスポンスのペイロード

ページが、条件に一致するアドレスに送信する、またはそこから受信するデータ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape および (Bot Manager session cookie (hash~token) または Bot Manager edge session cookie または Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only または Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ または Bot Manager sensor object (bmak) または Bot Manager sensor_data POST body) および (Bot Manager sensor cookie in its documented hash~state~token shape または Bot Manager session cookie (hash~token) または Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script および Bot Manager sensor cookie in its documented hash~state~token shape および (Akamai edge server header; CDN delivery, not Bot Manager on its own または Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own または Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint または SBSD challenge POST to the sbsd endpoint) および SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own または Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) および (Bot Manager sensor cookie in its documented hash~state~token shape または Bot Manager session cookie (hash~token) または Bot Manager edge session cookie または Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie および (Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only または Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ および (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) または Bot Manager sensor cookie in its documented hash~state~token shape または Bot Manager session cookie (hash~token)) |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Akamai Bot Manager が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Akamai Bot Manager で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Akamai Bot Manager が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
