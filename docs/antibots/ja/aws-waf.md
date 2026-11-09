[English](../aws-waf.md) | [Español](../es/aws-waf.md) | [Русский](../ru/aws-waf.md) | [简体中文](../zh-CN/aws-waf.md) | **日本語** | [Português (Brasil)](../pt-BR/aws-waf.md) | [Deutsch](../de/aws-waf.md) | [Français](../fr/aws-waf.md) | [한국어](../ko/aws-waf.md)

# AWS WAF のボット対策: 検出方法とスクレイピングへの影響

AWS WAF は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。AWS WAF の回避方法を調べている場合も、サイトで AWS WAF を検出したい場合も、AWS WAF によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に AWS WAF かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が AWS WAF のボット検出を見分けるために使う 12 件の公開シグナルと、それぞれがどの程度 AWS WAF を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

AWS WAF は Amazon Web Services のウェブアプリケーションファイアウォールです。Bot Control とチャレンジ機能により、ブラウザに JavaScript チャレンジの実行とトークンの保持を求めることがあるため、単純な HTTP クライアントは拒否される場合があります。

公式サイト: [https://aws.amazon.com/waf/](https://aws.amazon.com/waf/)

## サイトが AWS WAF を使っているかを見分ける方法

これらのシグナルは、`detect-aws-waf` に対する拡張機能自身の検出ルール（ルールのバージョン 2.2.0、最終更新日 2026-11-09）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^aws-waf-token$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9+/=_:-]{20,}` | 100% | AWS WAF token cookie set after a challenge |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^x-amzn-waf-action$: ^(?:challenge\|captcha)$` | 100% | AWS WAF challenge or captcha action header |
| `^x-amzn-waf-challenge-id$` | 40% (補強のみ) | AWS WAF challenge id header |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.token\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:challenge\|captcha\|jsapi)\.js(?:[?#]\|$)` | 100% | Integration SDK from the regional token.awswaf.com host |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.token\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:inputs\|verify\|telemetry\|voucher\|mp_verify)(?:[?#/]\|$)` | 100% | Any request to the regional token.awswaf.com host (inputs, verify, telemetry) |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.captcha\.awswaf\.com/` | 100% | AWS WAF CAPTCHA host |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `gokuProps` | 15% (補強のみ) | Challenge page bootstrap variable (window.gokuProps) |
| `AwsWafIntegration` | 10% | Integration SDK namespace reference |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `AwsWafIntegration (typeof object)` | 75% | AWS WAF Integration SDK object |
| `gokuProps (typeof object)` | 70% | Challenge page bootstrap object (gokuProps) |
| `AwsWafCaptcha (typeof object)` | 75% | AWS WAF Integration SDK object |
| `awsWafCookieDomainList (exists)` | 30% (補強のみ) | Token cookie domain list for the Integration SDK |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Challenge response with its bootstrap | 100% | (AWS WAF challenge or captcha action header または AWS WAF challenge id header) および (Challenge page bootstrap object (gokuProps) または Challenge page bootstrap variable (window.gokuProps) または Integration SDK from the regional token.awswaf.com host) |
| Integration SDK with token traffic or cookie | 100% | (Integration SDK from the regional token.awswaf.com host または AWS WAF Integration SDK object) および (AWS WAF token cookie set after a challenge または Any request to the regional token.awswaf.com host (inputs, verify, telemetry) または Token cookie domain list for the Integration SDK) |
| Token cookie with SDK reference | 90% | AWS WAF token cookie set after a challenge および (Integration SDK namespace reference または Challenge page bootstrap variable (window.gokuProps) または Token cookie domain list for the Integration SDK) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

AWS WAF が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

AWS WAF で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに AWS WAF が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
