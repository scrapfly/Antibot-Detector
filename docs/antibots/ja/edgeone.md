[English](../edgeone.md) | [Español](../es/edgeone.md) | [Русский](../ru/edgeone.md) | [简体中文](../zh-CN/edgeone.md) | **日本語** | [Português (Brasil)](../pt-BR/edgeone.md) | [Deutsch](../de/edgeone.md) | [Français](../fr/edgeone.md) | [한국어](../ko/edgeone.md)

# Tencent Cloud EdgeOne のボット対策: 検出方法とスクレイピングへの影響

Tencent Cloud EdgeOne は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Tencent Cloud EdgeOne の回避方法を調べている場合も、サイトで Tencent Cloud EdgeOne を検出したい場合も、Tencent Cloud EdgeOne によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Tencent Cloud EdgeOne かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Tencent Cloud EdgeOne のボット検出を見分けるために使う 8 件の公開シグナルと、それぞれがどの程度 Tencent Cloud EdgeOne を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Tencent Cloud EdgeOne は、Tencent Cloud のエッジ高速化とセキュリティのプラットフォームです。コンテンツ配信に加えて WAF とボット管理を備え、JavaScript チャレンジを出したり、アテステーション SDK でクライアントを確認したりできます。

公式サイト: [https://edgeone.ai/](https://edgeone.ai/)

## サイトが Tencent Cloud EdgeOne を使っているかを見分ける方法

これらのシグナルは、`detect-edgeone` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^EO-Bot-SessionId$` | 90% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) |
| `^EO-Bot-Token$` | 90% | EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| `^EO_Bot_Ssid$` | 60% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^eo-log-uuid$: ^[0-9]{10,24}$` | 40% (補強のみ) | EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection |
| `^server$: ^TencentEdgeOne$` | 40% (補強のみ) | Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://cdnstatic\.tencentcs\.com/edgeone/security/client-attestation/eoclientsecuritykit(?:\.min)?\.js(?:[?#]\|$)` | 100% | EdgeOne client attestation SDK eoclientsecuritykit.min.js on Tencent's CDN (EdgeOne docs) |
| `^https?://[^/?#]+/\.eo-sec-bot/` | 100% | Request to /.eo-sec-bot/ on the site, which the EdgeOne attestation SDK calls to start (EdgeOne docs) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `EOClientSecurityKit (typeof object)` | 75% | EOClientSecurityKit object of the EdgeOne client attestation SDK |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Bot session cookie and client verification token | 100% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) および EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| Bot management cookie on an EdgeOne response | 95% | (EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) または EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs)) および (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection または Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| JavaScript challenge cookie on an EdgeOne response | 90% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs および (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection または Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| Attestation SDK object on an EdgeOne response | 90% | EOClientSecurityKit object of the EdgeOne client attestation SDK および (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection または Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Tencent Cloud EdgeOne が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Tencent Cloud EdgeOne で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Tencent Cloud EdgeOne が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
