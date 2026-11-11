[English](../huaweicloud-waf.md) | [Español](../es/huaweicloud-waf.md) | [Русский](../ru/huaweicloud-waf.md) | [简体中文](../zh-CN/huaweicloud-waf.md) | **日本語** | [Português (Brasil)](../pt-BR/huaweicloud-waf.md) | [Deutsch](../de/huaweicloud-waf.md) | [Français](../fr/huaweicloud-waf.md) | [한국어](../ko/huaweicloud-waf.md)

# Huawei Cloud WAF のボット対策: 検出方法とスクレイピングへの影響

Huawei Cloud WAF は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Huawei Cloud WAF の回避方法を調べている場合も、サイトで Huawei Cloud WAF を検出したい場合も、Huawei Cloud WAF によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Huawei Cloud WAF かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Huawei Cloud WAF のボット検出を見分けるために使う 3 件の公開シグナルと、それぞれがどの程度 Huawei Cloud WAF を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Huawei Cloud WAF は、Huawei Cloud のウェブアプリケーションファイアウォールです。接続されたサイトでは訪問者のリクエストにセッション Cookie を追加し、CC 攻撃対策やアンチクローラーのルールがそれを使ってリクエストを数え、追跡します。

公式サイト: [https://www.huaweicloud.com/intl/en-us/product/waf.html](https://www.huaweicloud.com/intl/en-us/product/waf.html)

## サイトが Huawei Cloud WAF を使っているかを見分ける方法

これらのシグナルは、`detect-huaweicloud-waf` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-11-11）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^HWWAFSESID$` | 90% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| `^HWWAFSESTIME$` | 90% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^server$: HuaweiCloudWAF` | 40% (補強のみ) | Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Both WAF session cookies | 100% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) および HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| Session ID cookie with the WAF server header | 95% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) および Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |
| Session timestamp cookie with the WAF server header | 95% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) および Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Huawei Cloud WAF が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Huawei Cloud WAF で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Huawei Cloud WAF が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
