[English](../wordfence.md) | [Español](../es/wordfence.md) | [Русский](../ru/wordfence.md) | [简体中文](../zh-CN/wordfence.md) | **日本語** | [Português (Brasil)](../pt-BR/wordfence.md) | [Deutsch](../de/wordfence.md) | [Français](../fr/wordfence.md) | [한국어](../ko/wordfence.md)

# Wordfence のボット対策: 検出方法とスクレイピングへの影響

Wordfence は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Wordfence の回避方法を調べている場合も、サイトで Wordfence を検出したい場合も、Wordfence によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Wordfence かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Wordfence のボット検出を見分けるために使う 19 件の公開シグナルと、それぞれがどの程度 Wordfence を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Wordfence は人気のある WordPress セキュリティプラグインです。単一の WordPress サイトに、ファイアウォール、レート制限、ログイン保護を追加します。

公式サイト: [https://www.wordfence.com/](https://www.wordfence.com/)

## サイトが Wordfence を使っているかを見分ける方法

これらのシグナルは、`detect-wordfence` に対する拡張機能自身の検出ルール（ルールのバージョン 2.0.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^wfwaf-authcookie-[0-9a-f]{32}$` | 60% | Wordfence firewall cookie wfwaf-authcookie-<hash> set for logged-in users |
| `^wf_loginalerted_[0-9a-f]{64}$` | 60% | Wordfence new-device login alert cookie wf_loginalerted_<hash> |
| `^wfls-remembered-[A-Za-z0-9_-]{20,24}$` | 60% | Wordfence Login Security cookie wfls-remembered-<id> for a device that passed 2FA |
| `^wfCBLBypass$ = ^[0-9a-f]{13}$` | 60% | Wordfence country blocking bypass cookie wfCBLBypass |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence(?:-login-security)?/(?:modules/login-security/)?js/(?:login\|wflsi18n)\.\d+(?:\.min)?\.js(?:[?#]\|$)` | 90% | Wordfence Login Security login script or its translations |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence/(?:js\|css)/[\w.-]+\.(?:js\|css)(?:[?#]\|$)` | 80% | Script or stylesheet from the Wordfence plugin's own js or css folder |
| `^https?://[^/?#]+/(?:[^?#]*/)?\?wordfence_lh=1&hid=` | 50% | Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `WFLSVars` | 30% | Script defining WFLSVars, the Wordfence Login Security settings |
| `WFAJAXWatcherVars` | 30% | Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings |
| `wfLogHumanRan` | 20% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) |
| `_wfsf=unlockEmail` | 20% | Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) |
| `user-reports.wordfence` | 20% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `WFLSVars (typeof object)` | 60% | Wordfence Login Security settings object |
| `WFLSVars.useCAPTCHA (truthy)` | 60% | Wordfence Login Security reCAPTCHA turned on |
| `wordfenceAJAXWatcher (typeof object)` | 60% | Wordfence firewall watcher object |

### DOM 要素

CSS セレクターで照合される要素。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `a[href="https://www.wordfence.com/help/?query=locked-out"]` | 30% (補強のみ) | Locked-out documentation link on the Wordfence block page |
| `input#unlock-email` | 20% (補強のみ) | Unlock email field on the Wordfence block page |
| `input[name="wfwaf-false-positive-verified"]` | 50% | Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins |
| `a#reportButton` | 10% (補強のみ) | Report Problem button on the Wordfence blocklist page |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Login Security script with its settings | 100% | Wordfence Login Security login script or its translations および (Wordfence Login Security settings object または Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security with reCAPTCHA turned on | 100% | Wordfence Login Security reCAPTCHA turned on および (Wordfence Login Security login script or its translations または Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security settings in a script and at runtime | 90% | Script defining WFLSVars, the Wordfence Login Security settings および Wordfence Login Security settings object |
| Live Traffic script and its report request | 85% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) および Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |
| Firewall watcher script with its settings | 90% | Script or stylesheet from the Wordfence plugin's own js or css folder および (Wordfence firewall watcher object または Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings) |
| Wordfence block page help link with its unlock form or allowlist field | 85% | Locked-out documentation link on the Wordfence block page および (Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) または Unlock email field on the Wordfence block page または Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins) |
| Wordfence blocklist page report script and button | 80% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) および Report Problem button on the Wordfence blocklist page |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Wordfence が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Wordfence で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Wordfence が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
