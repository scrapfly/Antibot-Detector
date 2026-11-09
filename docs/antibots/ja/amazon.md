[English](../amazon.md) | [Español](../es/amazon.md) | [Русский](../ru/amazon.md) | [简体中文](../zh-CN/amazon.md) | **日本語** | [Português (Brasil)](../pt-BR/amazon.md) | [Deutsch](../de/amazon.md) | [Français](../fr/amazon.md) | [한국어](../ko/amazon.md)

# Amazon Bot Protection のボット対策: 検出方法とスクレイピングへの影響

Amazon Bot Protection は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Amazon Bot Protection の回避方法を調べている場合も、サイトで Amazon Bot Protection を検出したい場合も、Amazon Bot Protection によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Amazon Bot Protection かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Amazon Bot Protection のボット検出を見分けるために使う 3 件の公開シグナルと、それぞれがどの程度 Amazon Bot Protection を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Amazon のサインインページは、クライアント側でブラウザフィンガープリントを収集し、ログインフォームが認証情報と一緒に送信します。これは、他のサイトが購入できる製品ではなく、Amazon 独自の不正利用対策ツールの一部です。

公式サイト: [https://www.amazon.com/](https://www.amazon.com/)

## サイトが Amazon Bot Protection を使っているかを見分ける方法

これらのシグナルは、`detect-amazon` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.1、最終更新日 2026-11-04）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `fwcimCmd` | 30% (補強のみ) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (補強のみ) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint および FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint および Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages および Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## 難易度

**高.** 「高」は、拡張機能がこの対策を突破が最も難しいものの一つと評価していることを意味します。通常、クライアント側のチェックと、行動分析またはサーバー側のスコアリングを組み合わせています。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Amazon Bot Protection が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Amazon Bot Protection で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Amazon Bot Protection が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
