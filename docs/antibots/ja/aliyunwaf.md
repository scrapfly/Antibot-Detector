[English](../aliyunwaf.md) | [Español](../es/aliyunwaf.md) | [Русский](../ru/aliyunwaf.md) | [简体中文](../zh-CN/aliyunwaf.md) | **日本語** | [Português (Brasil)](../pt-BR/aliyunwaf.md) | [Deutsch](../de/aliyunwaf.md) | [Français](../fr/aliyunwaf.md) | [한국어](../ko/aliyunwaf.md)

# Alibaba Cloud WAF のボット対策: 検出方法とスクレイピングへの影響

Alibaba Cloud WAF は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Alibaba Cloud WAF の回避方法を調べている場合も、サイトで Alibaba Cloud WAF を検出したい場合も、Alibaba Cloud WAF によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Alibaba Cloud WAF かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Alibaba Cloud WAF のボット検出を見分けるために使う 8 件の公開シグナルと、それぞれがどの程度 Alibaba Cloud WAF を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Alibaba Cloud WAF は、Alibaba Cloud のウェブアプリケーションファイアウォールです。攻撃のフィルタリングに加え、信頼できないクライアントに JavaScript チャレンジを提示することがあり、そのため多くの中国のサイトや一部のグローバルサイトの前段で見られます。

公式サイト: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## サイトが Alibaba Cloud WAF を使っているかを見分ける方法

これらのシグナルは、`detect-aliyunwaf` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.0、最終更新日 2026-10-16）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (補強のみ) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (補強のみ) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (補強のみ) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (補強のみ) | Trace-id line of the Alibaba Cloud WAF block page |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie および Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) および Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie および (Alibaba Cloud WAF load-balancing session cookie または Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host および (Alibaba Cloud WAF JavaScript-challenge clearance cookie または Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) または Banner image of the Alibaba Cloud WAF 405 block page (English UI)) および Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie および Alibaba Cloud WAF load-balancing session cookie および Block-page help resources on the Aliyun Yundun errors host |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Alibaba Cloud WAF が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Alibaba Cloud WAF で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Alibaba Cloud WAF が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
