[English](../sucuri.md) | [Español](../es/sucuri.md) | [Русский](../ru/sucuri.md) | [简体中文](../zh-CN/sucuri.md) | **日本語** | [Português (Brasil)](../pt-BR/sucuri.md) | [Deutsch](../de/sucuri.md) | [Français](../fr/sucuri.md) | [한국어](../ko/sucuri.md)

# Sucuri WAF のボット対策: 検出方法とスクレイピングへの影響

Sucuri WAF は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Sucuri WAF の回避方法を調べている場合も、サイトで Sucuri WAF を検出したい場合も、Sucuri WAF によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Sucuri WAF かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Sucuri WAF のボット検出を見分けるために使う 8 件の公開シグナルと、それぞれがどの程度 Sucuri WAF を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Sucuri はウェブサイトセキュリティの企業で、そのクラウド WAF と CDN がサイトの前段に置かれ、攻撃や不要なトラフィックをフィルタリングします。

公式サイト: [https://sucuri.net/](https://sucuri.net/)

## サイトが Sucuri WAF を使っているかを見分ける方法

これらのシグナルは、`detect-sucuri` に対する拡張機能自身の検出ルール（ルールのバージョン 2.2.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (補強のみ) | Sucuri cache status header |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `Sucuri Web ?Site Firewall - (?:CloudProxy - )?Access Denied\|Access Denied - Sucuri Web ?Site Firewall` | 30% (補強のみ) | Sucuri block page title |
| `Block ID:` | 20% (補強のみ) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title または Block ID label on the Sucuri block page) および (Sucuri WAF node id header または Sucuri block reason header または Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header および (Sucuri WAF node id header または Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable および (Sucuri CloudProxy JS-challenge cookie または Sucuri WAF node id header または Sucuri CloudProxy server header) |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Sucuri WAF が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Sucuri WAF で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Sucuri WAF が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
