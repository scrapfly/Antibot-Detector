[English](../kount.md) | [Español](../es/kount.md) | [Русский](../ru/kount.md) | [简体中文](../zh-CN/kount.md) | **日本語** | [Português (Brasil)](../pt-BR/kount.md) | [Deutsch](../de/kount.md) | [Français](../fr/kount.md) | [한국어](../ko/kount.md)

# Kount のボット対策: 検出方法とスクレイピングへの影響

Kount は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Kount の回避方法を調べている場合も、サイトで Kount を検出したい場合も、Kount によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Kount かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Kount のボット検出を見分けるために使う 4 件の公開シグナルと、それぞれがどの程度 Kount を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Kount は Equifax 傘下の決済不正対策企業です。Device Data Collector がブラウザ情報を収集し、加盟店のバックエンドがそれをリスク判定のために Kount に送信します。

公式サイト: [https://kount.com/](https://kount.com/)

## サイトが Kount を使っているかを見分ける方法

これらのシグナルは、`detect-kount` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://(?:ssl\|tst)\.kaptcha\.com/collect/sdk\?(?:[^#]*&)?m=[0-9]{3,}(?:[&#]\|$)` | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) |
| `^https://(?:ssl\|tst)\.kaptcha\.com/(?:cs/(?:config\|generatecookie\|storecookie\|location)\|session/[A-Za-z0-9_-]+\|logo\.htm\|fin)(?:[?#]\|$)` | 100% | Kount Web SDK request to the vendor kaptcha.com collector |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `kaxsdc` | 20% | Script reference to the kaxsdc class that triggers Kount data collection |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `ka.ClientSDK (typeof function)` | 60% | ka.ClientSDK class of the Kount data collector |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Kount collector script with its class or trigger | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) および (ka.ClientSDK class of the Kount data collector または Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount collector request with its script or class | 95% | Kount Web SDK request to the vendor kaptcha.com collector および (Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) または ka.ClientSDK class of the Kount data collector または Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount class with its trigger | 80% | ka.ClientSDK class of the Kount data collector および Script reference to the kaxsdc class that triggers Kount data collection |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Kount が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Kount で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Kount が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
