[English](../jiasule.md) | [Español](../es/jiasule.md) | [Русский](../ru/jiasule.md) | [简体中文](../zh-CN/jiasule.md) | **日本語** | [Português (Brasil)](../pt-BR/jiasule.md) | [Deutsch](../de/jiasule.md) | [Français](../fr/jiasule.md) | [한국어](../ko/jiasule.md)

# Jiasule (Chuangyu Shield) のボット対策: 検出方法とスクレイピングへの影響

Jiasule (Chuangyu Shield) は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Jiasule (Chuangyu Shield) の回避方法を調べている場合も、サイトで Jiasule (Chuangyu Shield) を検出したい場合も、Jiasule (Chuangyu Shield) によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Jiasule (Chuangyu Shield) かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Jiasule (Chuangyu Shield) のボット検出を見分けるために使う 7 件の公開シグナルと、それぞれがどの程度 Jiasule (Chuangyu Shield) を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Jiasule（Chuangyu Shield とも表記）は、中国の Knownsec が提供する DDoS 対策およびウェブ保護サービスです。ページの読み込み前に JavaScript のゲートを表示することがよくあります。

公式サイト: [https://www.jiasule.com/](https://www.jiasule.com/)

## サイトが Jiasule (Chuangyu Shield) を使っているかを見分ける方法

これらのシグナルは、`detect-jiasule` に対する拡張機能自身の検出ルール（ルールのバージョン 2.2.0、最終更新日 2026-10-16）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (補強のみ) | Jiasule tracking cookie set alongside the challenge cookies |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie および Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response または Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) および (Jiasule visitor id cookie set on first request または Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response および Jiasule visitor id cookie set on first request および Jiasule JavaScript-challenge clearance cookie |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Jiasule (Chuangyu Shield) が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Jiasule (Chuangyu Shield) で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Jiasule (Chuangyu Shield) が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
