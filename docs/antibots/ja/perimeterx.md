[English](../perimeterx.md) | [Español](../es/perimeterx.md) | [Русский](../ru/perimeterx.md) | [简体中文](../zh-CN/perimeterx.md) | **日本語** | [Português (Brasil)](../pt-BR/perimeterx.md) | [Deutsch](../de/perimeterx.md) | [Français](../fr/perimeterx.md) | [한국어](../ko/perimeterx.md)

# HUMAN (PerimeterX) のボット対策: 検出方法とスクレイピングへの影響

HUMAN (PerimeterX) は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。HUMAN (PerimeterX) の回避方法を調べている場合も、サイトで HUMAN (PerimeterX) を検出したい場合も、HUMAN (PerimeterX) によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に HUMAN (PerimeterX) かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が HUMAN (PerimeterX) のボット検出を見分けるために使う 22 件の公開シグナルと、それぞれがどの程度 HUMAN (PerimeterX) を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

PerimeterX は現在 HUMAN Security の一部です。そのボットディフェンダーはページにスクリプトを置き、行動とデバイスのシグナルで訪問者をスコアリングし、長押し型のチャレンジで応答することがあります。

公式サイト: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## サイトが HUMAN (PerimeterX) を使っているかを見分ける方法

これらのシグナルは、`detect-perimeterx` に対する拡張機能自身の検出ルール（ルールのバージョン 2.4.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (補強のみ) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| `^(?:_pxmvid\|_pxttld\|_pxwvm\|_pxmd\|_pxda\|_pxac)$` | 60% | Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac) |
| `^__pxvid$` | 60% | HUMAN Code Defender visitor cookie (__pxvid) |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (補強のみ) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |
| `^https://(?:[a-z0-9-]+\.)+(?:px-cloud\.net\|px-cdn\.net\|px-client\.net\|pxchk\.net\|perimeterx\.net\|hsprotect\.net)(?:[/?#:]\|$)` | 100% | Request to a HUMAN (PerimeterX) sensor, collector or challenge host |
| `^https?://[^/?#]+/(?:PX)?[A-Za-z0-9]{8}/xhr/api/v[0-9]/collector(?:[/?#]\|$)` | 85% | First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector) |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/init\.js(?:[?#]\|$)` | 30% (補強のみ) | First-party init.js under an app-ID path without the PX prefix; corroboration only |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (補強のみ) | Optional PerimeterX init callback defined by the site |
| `_pxUuid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxVid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxBlockedUrl (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxJsClientSrc (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `div#px-captcha` | 60% | HUMAN challenge container (div#px-captcha) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID または First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) または PerimeterX application ID または PerimeterX collector endpoint) および (PerimeterX risk token cookie (_px2 or _px3) または PerimeterX first-party server cookie または PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | 次のうち 2 件以上: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host および (PerimeterX application ID または Script assigning the PerimeterX app ID (window._pxAppId) または Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) および (PerimeterX application ID または Script assigning the PerimeterX app ID (window._pxAppId) または Optional PerimeterX init callback defined by the site) |
| First-party HUMAN sensor with its app ID or cookies | 95% | (First-party init.js under an app-ID path without the PX prefix; corroboration only または First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector)) および (PerimeterX application ID または Script assigning the PerimeterX app ID (window._pxAppId) または Optional PerimeterX init callback defined by the site または Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) または Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac)) |
| HUMAN block page with its challenge | 95% | (HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) または HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) または HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) または HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) または HUMAN challenge container (div#px-captcha)) および (PerimeterX challenge (Press & Hold) script host または First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) または Request to a HUMAN (PerimeterX) sensor, collector or challenge host) |

## 難易度

**高.** 「高」は、拡張機能がこの対策を突破が最も難しいものの一つと評価していることを意味します。通常、クライアント側のチェックと、行動分析またはサーバー側のスコアリングを組み合わせています。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

HUMAN (PerimeterX) が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

HUMAN (PerimeterX) で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに HUMAN (PerimeterX) が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
