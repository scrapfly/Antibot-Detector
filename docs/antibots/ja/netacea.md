[English](../netacea.md) | [Español](../es/netacea.md) | [Русский](../ru/netacea.md) | [简体中文](../zh-CN/netacea.md) | **日本語** | [Português (Brasil)](../pt-BR/netacea.md) | [Deutsch](../de/netacea.md) | [Français](../fr/netacea.md) | [한국어](../ko/netacea.md)

# Netacea のボット対策: 検出方法とスクレイピングへの影響

Netacea は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Netacea の回避方法を調べている場合も、サイトで Netacea を検出したい場合も、Netacea によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Netacea かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Netacea のボット検出を見分けるために使う 3 件の公開シグナルと、それぞれがどの程度 Netacea を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Netacea は、すべてのリクエストでページスクリプトを使わず、エッジまたはサーバーでトラフィックを読み取って動作するボット管理ベンダーです。目に見える主な痕跡は Cookie で、その名前は顧客ごとに変更できます。

公式サイト: [https://www.netacea.com/](https://www.netacea.com/)

## サイトが Netacea を使っているかを見分ける方法

これらのシグナルは、`detect-netacea` に対する拡張機能自身の検出ルール（ルールのバージョン 2.2.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^_mitata$` | 60% | Netacea mitigation cookie, in the browser or set by the server (default name) |
| `^_mitatacaptcha$` | 100% | Netacea captcha-serving cookie (default name) |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/AtaVerifyCaptcha(?:[?#]\|$)` | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Captcha cookie with a mitigation cookie | 100% | Netacea captcha-serving cookie (default name) および Netacea mitigation cookie, in the browser or set by the server (default name) |
| Captcha verification with a Netacea cookie | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) および Netacea captcha-serving cookie (default name) |
| Captcha verification with the mitigation cookie | 95% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) および Netacea mitigation cookie, in the browser or set by the server (default name) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Netacea が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Netacea で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Netacea が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
