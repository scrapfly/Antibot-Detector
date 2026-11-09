[English](../ruishu.md) | [Español](../es/ruishu.md) | [Русский](../ru/ruishu.md) | [简体中文](../zh-CN/ruishu.md) | **日本語** | [Português (Brasil)](../pt-BR/ruishu.md) | [Deutsch](../de/ruishu.md) | [Français](../fr/ruishu.md) | [한국어](../ko/ruishu.md)

# Ruishu のボット対策: 検出方法とスクレイピングへの影響

Ruishu は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Ruishu の回避方法を調べている場合も、サイトで Ruishu を検出したい場合も、Ruishu によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Ruishu かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Ruishu のボット検出を見分けるために使う 6 件の公開シグナルと、それぞれがどの程度 Ruishu を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Ruishu は、River Security が提供する中国のボット対策製品です。通常、実際のページが配信される前に動的な Cookie を設定する、強く難読化された JavaScript を配信します。

公式サイト: [https://www.riversecurity.com/](https://www.riversecurity.com/)

## サイトが Ruishu を使っているかを見分ける方法

これらのシグナルは、`detect-ruishu` に対する拡張機能自身の検出ルール（ルールのバージョン 2.2.0、最終更新日 2026-10-16）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^FSSBBIl1UgzbN7N80[TS]$` | 100% | Ruishu static-cookie generator family (generation 4 name family) |
| `^waf_ci` | 45% (補強のみ) | Ruishu WAF challenge-index cookie |
| `^[A-Za-z0-9]{12}[SO]$` | 30% (補強のみ) | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page |
| `^[A-Za-z0-9]{12}[TP]$` | 30% (補強のみ) | Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `$_ts (typeof object)` | 70% | Ruishu challenge state object defined by the obfuscated challenge script |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `script[r="m"]` | 60% | Ruishu challenge page: every script tag carries the r="m" marker attribute |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Challenge-page script marker with a Ruishu cookie | 90% | Ruishu challenge page: every script tag carries the r="m" marker attribute および (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page または Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads または Ruishu static-cookie generator family (generation 4 name family)) |
| Challenge state object with a Ruishu cookie | 90% | Ruishu challenge state object defined by the obfuscated challenge script および (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page または Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads または Ruishu static-cookie generator family (generation 4 name family)) |
| Server and client challenge cookies left after the challenge passed | 85% | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page および Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |
| Static-cookie family with the challenge-index cookie | 75% | Ruishu static-cookie generator family (generation 4 name family) および Ruishu WAF challenge-index cookie |
| Challenge state, script marker and a Ruishu cookie | 100% | Ruishu challenge state object defined by the obfuscated challenge script および Ruishu challenge page: every script tag carries the r="m" marker attribute および (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page または Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads または Ruishu static-cookie generator family (generation 4 name family)) |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Ruishu が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Ruishu で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Ruishu が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
