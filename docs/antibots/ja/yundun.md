[English](../yundun.md) | [Español](../es/yundun.md) | [Русский](../ru/yundun.md) | [简体中文](../zh-CN/yundun.md) | **日本語** | [Português (Brasil)](../pt-BR/yundun.md) | [Deutsch](../de/yundun.md) | [Français](../fr/yundun.md) | [한국어](../ko/yundun.md)

# Yundun Cloud WAF のボット対策: 検出方法とスクレイピングへの影響

Yundun Cloud WAF は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Yundun Cloud WAF の回避方法を調べている場合も、サイトで Yundun Cloud WAF を検出したい場合も、Yundun Cloud WAF によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Yundun Cloud WAF かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Yundun Cloud WAF のボット検出を見分けるために使う 11 件の公開シグナルと、それぞれがどの程度 Yundun Cloud WAF を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Yundun は、クラウド WAF と DDoS 対策サービスを提供する中国のクラウドセキュリティプロバイダーです。そのチェックは中国のウェブサイトでよく見られます。

公式サイト: [https://www.yundun.com/](https://www.yundun.com/)

## サイトが Yundun Cloud WAF を使っているかを見分ける方法

これらのシグナルは、`detect-yundun` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.2、最終更新日 2026-10-29）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (補強のみ) | Yundun WAF session cookie |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (補強のみ) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (補強のみ) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (補強のみ) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges) および Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie および (Server header carrying the Yundun edge signature (legacy edges) または Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges) および Cache header carrying the Yundun edge signature (legacy edges) および Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge および X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) および Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) または First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)) および (Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) または Yundun WAF captcha marker cookie または Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) および Yundun WAF captcha marker cookie および Server: WAF sent by the current Yundun edge |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Yundun Cloud WAF が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Yundun Cloud WAF で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Yundun Cloud WAF が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
