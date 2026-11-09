[English](../botguard.md) | [Español](../es/botguard.md) | [Русский](../ru/botguard.md) | [简体中文](../zh-CN/botguard.md) | **日本語** | [Português (Brasil)](../pt-BR/botguard.md) | [Deutsch](../de/botguard.md) | [Français](../fr/botguard.md) | [한국어](../ko/botguard.md)

# Google BotGuard のボット対策: 検出方法とスクレイピングへの影響

Google BotGuard は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Google BotGuard の回避方法を調べている場合も、サイトで Google BotGuard を検出したい場合も、Google BotGuard によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Google BotGuard かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Google BotGuard のボット検出を見分けるために使う 7 件の公開シグナルと、それぞれがどの程度 Google BotGuard を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

BotGuard は Google 独自のクライアント側の整合性検証およびボット検出技術です。Google のサービスや reCAPTCHA で使われており、仕組みは公開されていません。

公式サイト: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## サイトが Google BotGuard を使っているかを見分ける方法

これらのシグナルは、`detect-botguard` に対する拡張機能自身の検出ルール（ルールのバージョン 2.3.0、最終更新日 2026-10-17）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (補強のみ) | BotGuard interpreter URL key |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `trayride (exists)` | 50% (補強のみ) | BotGuard VM global (globalName from bgChallenge) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) または BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) および (Web Anti-Abuse (BotGuard) attestation RPC または Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) または BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) および (BotGuard challenge config key in page data または BotGuard interpreter URL key または BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC または Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) および (BotGuard VM global (globalName from bgChallenge) または BotGuard challenge config key in page data) |

## 難易度

**高.** 「高」は、拡張機能がこの対策を突破が最も難しいものの一つと評価していることを意味します。通常、クライアント側のチェックと、行動分析またはサーバー側のスコアリングを組み合わせています。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Google BotGuard が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Google BotGuard で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Google BotGuard が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
