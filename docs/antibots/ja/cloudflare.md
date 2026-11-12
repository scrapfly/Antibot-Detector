[English](../cloudflare.md) | [Español](../es/cloudflare.md) | [Русский](../ru/cloudflare.md) | [简体中文](../zh-CN/cloudflare.md) | **日本語** | [Português (Brasil)](../pt-BR/cloudflare.md) | [Deutsch](../de/cloudflare.md) | [Français](../fr/cloudflare.md) | [한국어](../ko/cloudflare.md)

# Cloudflare Bot Management のボット対策: 検出方法とスクレイピングへの影響

Cloudflare Bot Management は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Cloudflare Bot Management の回避方法を調べている場合も、サイトで Cloudflare Bot Management を検出したい場合も、Cloudflare Bot Management によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Cloudflare Bot Management かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Cloudflare Bot Management のボット検出を見分けるために使う 19 件の公開シグナルと、それぞれがどの程度 Cloudflare Bot Management を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Cloudflare Bot Management は、グローバルネットワークから提供される Cloudflare の有料ボット検出製品です。Cloudflare は無料のチャレンジページも運用しているため、Cloudflare のチャレンジが表示されても、それだけで有料製品が有効とは限りません。

公式サイト: [https://www.cloudflare.com/products/bot-management/](https://www.cloudflare.com/products/bot-management/)

## サイトが Cloudflare Bot Management を使っているかを見分ける方法

これらのシグナルは、`detect-cloudflare` に対する拡張機能自身の検出ルール（ルールのバージョン 2.4.0、最終更新日 2026-11-12）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### Cookie

ページに設定される Cookie の名前（値が照合される場合は値も）。単純な単語でない限り、パターンは正規表現です。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^cf_clearance$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Challenge clearance cookie, set after passing a Cloudflare challenge |
| `^__cf_bm$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}\.[0-9]{5,8}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode |
| `^cf_clearance$` | 85% | Challenge clearance cookie by name; its value is encrypted and its shape may change |
| `^__cf_bm$` | 85% | Bot Management cookie by name; its value is encrypted and its shape may change |
| `^cf_chl_rc_(?:i\|ni\|m)$` | 85% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) |
| `^__cfseq(?:-[A-Za-z0-9_-]{1,64})?$` | 90% | Sequence cookie of Cloudflare's bot products (__cfseq) |
| `^_cfuvid$` | 50% | Rate limiting cookie Cloudflare sets per visitor (_cfuvid); not bot management on its own |
| `^__cfruid$` | 40% (補強のみ) | Cloudflare cookie that identifies trusted traffic (__cfruid); corroboration only |

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^cf-mitigated$: ^challenge$` | 100% | Response header Cloudflare sends when it served a challenge page |
| `^server$: ^cloudflare$` | 15% (補強のみ) | Served through Cloudflare; CDN delivery, not bot management on its own |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https?://(?!(?:[a-z0-9-]+\.)?challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?orchestrate/(?:chl_page\|managed\|jsch\|captcha)/` | 100% | Challenge page orchestrator under /cdn-cgi/challenge-platform/ |
| `^https?://(?!(?:[a-z0-9-]+\.)?challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?scripts/jsd/(?:[0-9a-f]{6,20}/)?(?:main\|api)\.js(?:[?#]\|$)` | 100% | Bot Management JavaScript detections script |
| `^https?://(?!(?:[a-z0-9-]+\.)?challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?jsd/oneshot/` | 100% | Bot Management JavaScript detections report (/cdn-cgi/challenge-platform/…/jsd/oneshot/) |
| `^https?://(?!(?:[a-z0-9-]+\.)?challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?pat/` | 100% | Private Access Token request of a Cloudflare challenge (/cdn-cgi/challenge-platform/…/pat/) |
| `^https?://(?!(?:[a-z0-9-]+\.)?challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/` | 80% | Any other request under /cdn-cgi/challenge-platform/, the path of Cloudflare's challenges and bot detections |
| `^https://challenges\.cloudflare\.com/` | 40% (補強のみ) | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only |

### ページとスクリプトの内容

ページまたはそのスクリプト内で見つかるテキスト。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_cf_chl_opt` | 20% | Script reference to the _cf_chl_opt challenge options object |

### JavaScript グローバル（window）

ページ自身の JavaScript コンテキストが `window` に公開しているプロパティ。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `_cf_chl_opt (typeof object)` | 85% | Challenge options object present on a Cloudflare challenge page |
| `cloudflare.jsd.executeOnce (typeof function)` | 70% | JavaScript detections function Cloudflare defines (window.cloudflare.jsd.executeOnce) |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Challenge page orchestrator and challenge options object | 100% | (Challenge page orchestrator under /cdn-cgi/challenge-platform/ または Response header Cloudflare sends when it served a challenge page) および (Challenge options object present on a Cloudflare challenge page または Script reference to the _cf_chl_opt challenge options object) |
| Clearance cookie with Bot Management cookie | 85% | Challenge clearance cookie, set after passing a Cloudflare challenge および (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode または Served through Cloudflare; CDN delivery, not bot management on its own) |
| Bot Management script on a Cloudflare zone | 75% | Bot Management JavaScript detections script および (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode または Served through Cloudflare; CDN delivery, not bot management on its own) |
| Challenge host request on a Cloudflare zone with a challenge signal | 90% | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only および (Challenge clearance cookie, set after passing a Cloudflare challenge または Challenge options object present on a Cloudflare challenge page または Challenge page orchestrator under /cdn-cgi/challenge-platform/) |
| Challenge platform cookie with a Cloudflare clearance, server header or challenge | 95% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) および (Challenge clearance cookie, set after passing a Cloudflare challenge または Served through Cloudflare; CDN delivery, not bot management on its own または Challenge page orchestrator under /cdn-cgi/challenge-platform/ または Challenge options object present on a Cloudflare challenge page) |
| Cloudflare bot cookie with a Cloudflare server header or visitor cookie | 95% | (Challenge clearance cookie by name; its value is encrypted and its shape may change または Bot Management cookie by name; its value is encrypted and its shape may change または Sequence cookie of Cloudflare's bot products (__cfseq)) および (Served through Cloudflare; CDN delivery, not bot management on its own または Cloudflare cookie that identifies trusted traffic (__cfruid); corroboration only または Rate limiting cookie Cloudflare sets per visitor (_cfuvid); not bot management on its own) |
| Challenge platform request or detections runtime on a Cloudflare zone | 90% | (Any other request under /cdn-cgi/challenge-platform/, the path of Cloudflare's challenges and bot detections または JavaScript detections function Cloudflare defines (window.cloudflare.jsd.executeOnce)) および (Served through Cloudflare; CDN delivery, not bot management on its own または Bot Management cookie by name; its value is encrypted and its shape may change または Rate limiting cookie Cloudflare sets per visitor (_cfuvid); not bot management on its own) |

## 難易度

**中.** 「中」は、拡張機能がこの対策を実際の障害と評価していることを意味します。ブラウザ、リクエストの詳細、またはその両方に対するチェックが行われ、それらは時間とともに変化すると考えてください。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Cloudflare Bot Management が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Cloudflare Bot Management で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Cloudflare Bot Management が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
