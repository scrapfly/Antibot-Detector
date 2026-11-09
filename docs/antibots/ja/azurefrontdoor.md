[English](../azurefrontdoor.md) | [Español](../es/azurefrontdoor.md) | [Русский](../ru/azurefrontdoor.md) | [简体中文](../zh-CN/azurefrontdoor.md) | **日本語** | [Português (Brasil)](../pt-BR/azurefrontdoor.md) | [Deutsch](../de/azurefrontdoor.md) | [Français](../fr/azurefrontdoor.md) | [한국어](../ko/azurefrontdoor.md)

# Azure Front Door のボット対策: 検出方法とスクレイピングへの影響

Azure Front Door は、一部のウェブサイトがページの手前に置くボット対策（アンチボット）または不正利用対策のレイヤーです。Azure Front Door の回避方法を調べている場合も、サイトで Azure Front Door を検出したい場合も、Azure Front Door によるスクレイピングのブロックを調査している場合も、最初にやることは同じです。リクエストに応答しているのが本当に Azure Front Door かどうかを確認することです。このページでは、Scrapfly Antibot Detector 拡張機能が Azure Front Door のボット検出を見分けるために使う 4 件の公開シグナルと、それぞれがどの程度 Azure Front Door を示唆するか、そして自動化クライアントにとってそれが通常何を意味するかをまとめています。

## 概要

Azure Front Door は、Azure 向けの Microsoft のグローバルなコンテンツ配信およびアプリケーション配信サービスです。Azure のウェブアプリケーションファイアウォールと組み合わせることができるため、これが見つかっても分かるのはサイトの前段にあるエッジの情報であり、ボットがフィルタリングされているとは限りません。

公式サイト: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## サイトが Azure Front Door を使っているかを見分ける方法

これらのシグナルは、`detect-azurefrontdoor` に対する拡張機能自身の検出ルール（ルールのバージョン 2.1.0、最終更新日 2026-10-26）から生成されています。シグナルはあくまで目安です。信頼度とは、そのシグナル単体が確認されたときに拡張機能がどの程度確信を持つかを表します。「補強のみ」とマークされたシグナルは、他の製品でも発生しうるため、それだけでは判定に加算されません。

### レスポンスヘッダー

ページまたはそのリクエストが返す HTTP レスポンスヘッダー。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (補強のみ) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### スクリプトとリクエストの URL

ページが読み込むスクリプト、フレーム、リクエストのアドレス。完全なアドレスに対して照合されるパターンです。

| シグナル | 信頼度 | 示唆する内容 |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### 組み合わせ

一部のシグナルは、単独よりも組み合わさったときに高く評価されます。拡張機能はこれらの組み合わせも報告します。

| 組み合わせ | 信頼度 | 必要な条件 |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response および Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response および Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host および (Azure Front Door request reference header on every edge response または Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response および Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) および Resource served from an azurefd.net Front Door endpoint host |

## 難易度

**低.** 「低」は、拡張機能がこの対策を軽い障害と評価していることを意味します。通常は単純なクライアントを弾く程度で、実際のブラウザや、ブラウザに近い適切な形式のリクエストであれば通過できることが多いです。

この評価は拡張機能独自の経験則であり、ベンダーの見解ではありません。また、サイトの設定によって、同じ製品でも突破しやすくも難しくもなります。

## スクレイピングへの影響

Azure Front Door が存在する場合、本物で一貫性のあるブラウザセッションに見えないリクエストは、チャレンジを要求されたり、遅延させられたり、拒否されたりすることがあり、欲しかったコンテンツの代わりにチャレンジページやブロックページが返されることがあります。実際にどうなるかは、サイト運営者が製品をどう設定したかによって決まり、サイトごとに異なり、予告なく変わることもあります。検出結果は、ブロックされる保証ではなく、実際に受け取るレスポンスを確認すべき理由として扱ってください。

Azure Front Door で保護されたページを、回避策を自分で維持することなくスクレイピングするには、Scrapfly の [Anti Scraping Protection のドキュメント](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) と [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) をご覧ください。スクレイピングは許可されている範囲に限り、サイトの利用規約と robots のルールを尊重してください。

## 拡張機能で検出する

Chrome 用の無料の [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) をインストールしてページを開くと、ポップアップに Azure Front Door が、信頼度、難易度、一致したシグナルの詳細とともに表示されます。詳しくは [プロジェクトの README](../../README.ja.md) をご覧いただくか、[拡張機能が検出するすべてのアンチボット対策](README.md) をご覧ください。
