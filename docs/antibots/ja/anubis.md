[English](../anubis.md) | [Español](../es/anubis.md) | [Русский](../ru/anubis.md) | [简体中文](../zh-CN/anubis.md) | **日本語** | [Português (Brasil)](../pt-BR/anubis.md) | [Deutsch](../de/anubis.md) | [Français](../fr/anubis.md) | [한국어](../ko/anubis.md)

# Anubis のボット対策: 検出方法とスクレイピングへの影響

Anubis は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Anubis の回避方法を調べている場合も、サイトで Anubis を検出したい場合も、Anubis によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Anubis かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Anubis のボット検出を見分けるために使う 6 件の公開シグナルと、それぞれがどの程度 Anubis を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Anubis は Techaro が公開しているオープンソースのウェブゲートで、新しい訪問者のブラウザに、ページの読み込み前に小さな Proof-of-Work パズルを解かせます。AI クローラーを遅らせるために作られ、多くのオープンソースやコミュニティのサイトで導入されています。

公式サイト: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## サイトが Anubis を使っているかを見分ける方法

これらのシグナルは、`detect-anubis` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.1、最終更新日 2026-10-30）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (補強のみ) | Proof-of-work progress bar inner element on the challenge page |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint および (Anubis mascot image (pensive/happy/reject) loaded from the command endpoint または Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) または Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix)) および Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) および Anubis main challenge module loaded from the command endpoint および Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Anubis が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Anubis で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Anubis が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
