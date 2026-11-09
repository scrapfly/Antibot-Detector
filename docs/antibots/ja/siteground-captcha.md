[English](../siteground-captcha.md) | [Español](../es/siteground-captcha.md) | [Русский](../ru/siteground-captcha.md) | [简体中文](../zh-CN/siteground-captcha.md) | **日本語** | [Português (Brasil)](../pt-BR/siteground-captcha.md) | [Deutsch](../de/siteground-captcha.md) | [Français](../fr/siteground-captcha.md) | [한국어](../ko/siteground-captcha.md)

# SiteGround SG-CAPTCHA のボット対策: 検出方法とスクレイピングへの影響

SiteGround SG-CAPTCHA は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。SiteGround SG-CAPTCHA の回避方法を調べている場合も、サイトで SiteGround SG-CAPTCHA を検出したい場合も、SiteGround SG-CAPTCHA によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に SiteGround SG-CAPTCHA かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が SiteGround SG-CAPTCHA のボット検出を見分けるために使う 3 件の公開シグナルと、それぞれがどの程度 SiteGround SG-CAPTCHA を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

SG-CAPTCHA は SiteGround ホスティングが使うアンチボットチャレンジです。自動化されていると見られる訪問者はチャレンジページに送られ、通過しないとサイトが読み込まれません。

公式サイト: [https://www.siteground.com/blog/new-anti-bot-ai/](https://www.siteground.com/blog/new-anti-bot-ai/)

## サイトが SiteGround SG-CAPTCHA を使っているかを見分ける方法

これらのシグナルは、`detect-siteground-captcha` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-11-05）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^sg-captcha$: ^challenge$` | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/sgcaptcha/(?:[?#]\|$)` | 100% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `\bsg(?:challenge\|submit_url)\b` | 30% | SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| sg-captcha header on the SG-CAPTCHA challenge page | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge および SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |
| sg-captcha header with the challenge constants in the page's scripts | 95% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge および SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |
| SG-CAPTCHA challenge page with its constants in the page's scripts | 90% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ および SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

SiteGround SG-CAPTCHA が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

SiteGround SG-CAPTCHA で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに SiteGround SG-CAPTCHA が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
