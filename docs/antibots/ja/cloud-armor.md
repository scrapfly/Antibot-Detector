[English](../cloud-armor.md) | [Español](../es/cloud-armor.md) | [Русский](../ru/cloud-armor.md) | [简体中文](../zh-CN/cloud-armor.md) | **日本語** | [Português (Brasil)](../pt-BR/cloud-armor.md) | [Deutsch](../de/cloud-armor.md) | [Français](../fr/cloud-armor.md) | [한국어](../ko/cloud-armor.md)

# Google Cloud Armor のボット対策: 検出方法とスクレイピングへの影響

Google Cloud Armor は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Google Cloud Armor の回避方法を調べている場合も、サイトで Google Cloud Armor を検出したい場合も、Google Cloud Armor によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Google Cloud Armor かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Google Cloud Armor のボット検出を見分けるために使う 3 件の公開シグナルと、それぞれがどの程度 Google Cloud Armor を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Google Cloud Armor は、Google Cloud のロードバランサーの前に置かれる WAF と DDoS 対策のサービスです。ボット管理では reCAPTCHA を使って訪問者にチャレンジを出し、reCAPTCHA がブラウザーに残すトークンを確認します。

公式サイト: [https://cloud.google.com/security/products/armor](https://cloud.google.com/security/products/armor)

## サイトが Google Cloud Armor を使っているかを見分ける方法

これらのシグナルは、`detect-cloud-armor` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^recaptcha-ca-e$` | 90% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) |
| `^recaptcha-ca-t$` | 70% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://www\.(?:google\.com\|recaptcha\.net)/recaptcha/(?:api\|enterprise)\.js\?(?:[^#]*&)?waf=session(?:[&#]\|$)` | 50% (補強のみ) | reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Exemption cookie and session-token cookie | 100% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) および recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |
| Session-token cookie with the reCAPTCHA script that sets it | 85% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) および reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |
| Exemption cookie with a reCAPTCHA for WAF session-token script | 95% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) および reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Google Cloud Armor が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Google Cloud Armor で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Google Cloud Armor が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
