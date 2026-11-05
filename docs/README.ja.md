<div align="center">

<img src="../assets/store-screenshots/ja/01-detection-1280x800.png" alt="ページで見つかった保護機能を、それぞれのカテゴリと信頼度とともに一覧表示している Scrapfly Anti-bot Detector" width="880">

# Scrapfly Anti-bot Detector

**Web サイトがボットからどのように身を守っているかを確認できます：どのアンチボットシステムか、どの CAPTCHA か、どのフィンガープリンティングのスクリプトか、そしてそれぞれの一致がどれだけ確かなのか。**

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/pdpakdgmjhkfimgaihlgaaiijlbilkca?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)
[![Users](https://img.shields.io/chrome-web-store/users/pdpakdgmjhkfimgaihlgaaiijlbilkca?color=4285F4)](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)
[![Rating](https://img.shields.io/chrome-web-store/rating/pdpakdgmjhkfimgaihlgaaiijlbilkca?color=4285F4)](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)
[![CI](https://github.com/scrapfly/Antibot-Detector/actions/workflows/ci.yml/badge.svg)](https://github.com/scrapfly/Antibot-Detector/actions/workflows/ci.yml)
[![License: NPOSL-3.0](https://img.shields.io/badge/license-NPOSL--3.0-blue)](../LICENSE)

[**Chrome に追加**](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) · [製品ページ](https://scrapfly.io/products/antibot-detector) · [新機能](../CHANGELOG.md) · [llms.txt](../llms.txt) · [問題を報告](https://github.com/scrapfly/Antibot-Detector/issues)

[English](../README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Русский](README.ru.md) · **日本語**

</div>

---

Scrapfly Anti-bot Detector は、Web サイトが自動化されたトラフィックからどのように身を守っているかを表示する、無料の Chrome 拡張機能です。いつもどおりにブラウジングするだけで、ツールバーのアイコンの数字がそのページで使われている保護機能の数を示し、ポップアップにはそれぞれの信頼度、難易度、そして検出の決め手となったシグナルが一覧表示されます。

標準で 85 の技術を認識します：42 のアンチボットシステム、22 の CAPTCHA、21 のブラウザのフィンガープリンティングの手法です。各検出器は、読んだり、変更したり、拡張したりできるプレーンな JSON ファイルで、新しいルールはこのリポジトリのリリースごとに提供されます。そのため、Chrome が拡張機能そのものを更新する前に、**ルール → 更新** でそれらをインストールできます。

私たちがこれを [Scrapfly](https://scrapfly.io) で作ったのは、どのスクレイピングのプロジェクトも、同じ疑問から始まるからです：このページを守っているのは何か？自分のサイトのボット対策が外からどう見えるかを確認したり、セキュリティの研究に使ったりするのにも同じように役立ちます。

## 目次

- [スクリーンショット](#スクリーンショット)
- [インストール](#インストール)
- [仕組み](#仕組み)
- [検出できるもの](#検出できるもの)
- [ポップアップの案内](#ポップアップの案内)
- [連携](#連携)
- [プライバシーと権限](#プライバシーと権限)
- [開発とコントリビュート](#開発とコントリビュート)
- [ライセンス](#ライセンス)

## スクリーンショット

画像をクリックすると、原寸で表示されます。

<table>
  <tr>
    <td width="50%"><a href="../assets/store-screenshots/ja/02-history-1280x800.png"><img src="../assets/store-screenshots/ja/02-history-1280x800.png" alt="スキャンした 3 つのページを表示した履歴タブ：最新のページは固定されてメモと「変化あり」のバッジが付いており、どのページにも保護機能、信頼度、難易度が表示されています" width="100%"></a></td>
    <td width="50%"><a href="../assets/store-screenshots/ja/03-rules-1280x800.png"><img src="../assets/store-screenshots/ja/03-rules-1280x800.png" alt="Cloudflare を検索しているルールタブ：カテゴリ、検出方法、バージョン、オン/オフのスイッチが付いた検出器のカード" width="100%"></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="../assets/store-screenshots/ja/04-advanced-tools-1280x800.png"><img src="../assets/store-screenshots/ja/04-advanced-tools-1280x800.png" alt="Google reCAPTCHA 用のツールを表示した詳細タブ：セレクターの取得、サイトキーの抽出、コールバックの調査" width="100%"></a></td>
    <td width="50%"><a href="../assets/store-screenshots/ja/05-settings-1280x800.png"><img src="../assets/store-screenshots/ja/05-settings-1280x800.png" alt="言語の一覧を開いた設定画面。22 のインターフェース言語が国旗とともに表示されています" width="100%"></a></td>
  </tr>
</table>

## インストール

### Chrome Web Store

最も簡単な方法です：[Chrome Web Store からインストール](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)してください。Chrome が自動的に最新の状態に保ちます。

### リリースから

[Releases ページ](https://github.com/scrapfly/Antibot-Detector/releases)の各バージョンには、そのまま読み込める zip が添付されています。

1. zip をダウンロードし、新しいフォルダーに展開します。
2. `chrome://extensions` を開き、（右上の）**デベロッパー モード** をオンにします。
3. **パッケージ化されていない拡張機能を読み込む** をクリックし、そのフォルダーを選択します。

### ソースから

ビルドの手順はありません。リポジトリをクローンし、フォルダーをそのまま読み込みます：

```bash
git clone https://github.com/scrapfly/Antibot-Detector.git
```

その後、上記の手順 2 と 3 に従い、クローンしたフォルダーを選択します。ファイルを編集したら、`chrome://extensions` の拡張機能のカードにある再読み込みボタンを押し、テストしているページを再読み込みしてください。

## 仕組み

ページが読み込まれると、拡張機能はページが自ら明かしている情報を集め、有効なすべての検出器と照合します。各検出器は、最大 8 つの方法を組み合わせます：

| 方法 | 調べる対象 | シグナルの例 |
| --- | --- | --- |
| URL | ページのアドレス、スクリプトの読み込み元、すべてのネットワークリクエスト | `challenges.cloudflare.com/turnstile/v0/api.js` |
| Cookie | サイトが設定または送信する Cookie（HttpOnly のものを含む） | `_abck` (Akamai), `datadome` |
| ヘッダー | レスポンスとリクエストのヘッダー | `x-kpsdk-ct` (Kasada) |
| コンテンツ | ページの HTML と、インラインおよび読み込まれたスクリプトのコード | `KPSDK.configure(` |
| DOM | CSS セレクターに一致する要素 | `.cf-turnstile[data-sitekey]` |
| Window のプロパティ | スクリプトが `window` に追加するオブジェクト | `grecaptcha.render` |
| JavaScript のフック | フィンガープリンティングによく使われるブラウザの API の呼び出し | `HTMLCanvasElement.prototype.toDataURL` |
| ペイロード | POST、PUT、PATCH のリクエストのボディ（URL とメソッドで絞り込むこともできます）と、ルールが指定した URL のレスポンス | `sensor_data` (Akamai), `"proofofwork":{"required":true` (OpenAI Sentinel) |

**信頼度。** 各ルールには独自の信頼度があり、検出器は、組み合わせるとより高いスコアになるルールの組み合わせを定義します。ベンダーの名前に触れているだけのスクリプトは 5〜10% です。そのベンダーの製品だけが生み出すシグナル（独自のスクリプトのホスト、独自の Cookie、チャレンジのエンドポイント）は証拠であり、単独で 100% になります。ベンダーの完全な統合（そのスクリプトと、Cookie、ウィジェットのフレーム、またはチャレンジのリクエストの組み合わせ）も同様です。共通または汎用のシグナルは 15〜90% にとどまります。各検出器に表示されるスコアは、最も強い単一のルールまたは組み合わせのものです。ページには難易度（低、中、高）も付けられ、ツールバーのバッジの色が決まります。

**フィンガープリンティング。** API のフックはページ自身のスクリプトが実行される前に設置され、フィンガープリンティングのコードがよく隠れている同一オリジンの iframe もカバーします。デフォルトでは、少なくとも 4 秒間監視し、その後はページが 2 秒間静かになるまで監視を続け、最長で 8 秒間監視します。

**キャッシュ。** 結果はデフォルトで 7 日間再利用されるので、ページを再訪するとすぐに表示されます。期間と、結果をドメイン全体で共有するか、同じパスのページで共有するか、正確な URL だけにするかは、**設定 → 検出** で変更できます。検出タブの **キャッシュをクリア** を使うと保存された結果が消去され、次にページを読み込んだときに再度スキャンされます。

## 検出できるもの

以下は、拡張機能に同梱されている検出器の一覧です。どれもルールタブでオフにしたり、編集したり、独自のものを追加したりできます。

<details>
<summary><b>アンチボットシステム（42）</b></summary>
<br>

Akamai Bot Manager · Alibaba Cloud WAF · Amazon Bot Protection · Anubis · AWS WAF · Azure Front Door · Castle · Cheq · Cloudflare Bot Management · Cloudflare Waiting Room · DataDome · DDoS-Guard · DeepSeek PoW · F5 BIG-IP ASM · Fastly Bot Management · FingerprintJS · Forter · Google BotGuard · HUMAN (PerimeterX) · Hunt · Incapsula (Imperva) · iovation (TransUnion TruValidate) · Jiasule (Chuangyu Shield) · Kasada · Kount · Meetrics Check · Netacea · Ocule · OpenAI Sentinel · Queue-it · Radware Bot Manager · Reblaze · Riskified · Ruishu · SEON · Shape Security · Sift · Sucuri WAF · ThreatMetrix · Vercel Firewall · Wordfence · Yundun Cloud WAF

</details>

<details>
<summary><b>CAPTCHA（22）</b></summary>
<br>

AliExpress CAPTCHA · Aliyun Captcha 2.0 · ALTCHA · Basilisk Captcha · Binance Captcha · Cap · Captcha.eu · Capy Puzzle Captcha · Cloudflare Turnstile · Dingxiang Captcha · Friendly Captcha · FunCaptcha (Arkose Labs) · GeeTest · Google reCAPTCHA · hCaptcha · Lemin Cropped Captcha · MTCaptcha · NetEase Yidun · Prosopo Procaptcha · QCloud Captcha · Shumei Captcha · Yandex SmartCaptcha

</details>

<details>
<summary><b>フィンガープリンティングの手法（21）</b></summary>
<br>

Audio · Battery API · Canvas · Clipboard API · Crypto · CSS · Device Orientation · Font · Gamepads API · Geolocation · Hardware · IndexedDB · Media · Navigator · Performance · Screen · Timezone/Intl · USB API · Web Storage · WebGL · WebRTC

</details>

## ポップアップの案内

### 検出

現在のページで見つかった保護機能が、それぞれの信頼度、難易度、一致した方法とともに表示されます。カードをクリックすると、その背後にある正確なシグナルを確認できます。ツールバーのアイコンにカーソルを合わせると、ポップアップを開かずに保護機能の名前が表示され、**Alt+Shift+S**（Mac では Control+Shift+S。ブラウザのショートカットの設定で変更できます）で現在のページを再度スキャンします。上部のボタンでは、次のことができます：

- **検出結果をアップロード** して共有リンクを取得します（デフォルトは dpaste.com。[共有リンク](#共有リンク)を参照）
- **キャッシュをクリア** して、次に読み込んだときにページを再度スキャンします
- **コピー** はメニューです：アップロードで共有するのと同じ概要、チケットやチャット用の Markdown の表、または JSON（いずれにも Cookie やヘッダーの値は含まれません）
- **このドメインをブロック** して、拡張機能がそのドメインをスキャンしないようにします

### 履歴

検出があったすべてのページが、保護機能と難易度とともに表示されます。検索したり、エントリーを開いて詳細を確認したり、JSON のエクスポートをインポートしたり、保護機能、期間、サイト、固定したページを先に選んでから、JSON、CSV、プレーンテキスト、Markdown としてエクスポートしたりできます。エントリーの **⋯** メニューからは、固定（履歴のクリーンアップ時にも残ります）、メモの追加、ページを開く、今すぐ再スキャン、Markdown としてコピーができます。「保護機能が変化しました」という通知をクリックすると、そのページが開きます。**変化あり** のバッジは、前回のスキャンと保護機能が異なるページを示します。**設定 → データ → 統計を開く** で、履歴からローカルで計算した統計のページ（アクティビティ、保護機能、ドメイン、信頼度、シグナル、組み合わせ、ルール、高度なツール）が開きます。

### ルール

組み込みのものも独自のものも含めた、すべての検出器です。それぞれをオンまたはオフにしたり、エディターを開いてパターンを変更したり、**追加** で独自の検出器を加えたりできます。**その他の操作** のメニュー（⋯）では、検出器を JSON でインポート・エクスポートできます。各パターンには独自の設定があります：どこを探すか（ページ、スクリプト、またはすべてのリクエスト。Cookie とヘッダーではリクエストかレスポンスか）、正規表現か、単語単位か、大文字と小文字を区別するか、そして信頼度です。エディターでは組み合わせと検出器のアイコンも扱え、正規表現のヘルパーを使えば、サンプルのテキストに対してパターンをテストできます。**履歴で確認** は、保存したページのうちいくつで各パターンと組み合わせが一致するかを表示し、**このページでテスト** は、ルールを現在の状態のまま（保存していない編集も含めて）、ポップアップを開いているページで実行します：各 Cookie、URL、コンテンツ、DOM のパターンがそこで何を見つけるか、そしてルールとその組み合わせが一致するかどうかです。ヘッダー、JS のフック、Window、ペイロードのパターンは実際のスキャンでしか判定できないため、テストではそれらを「一致なし」ではなく、そのように明示して一覧表示します。何も保存も送信もされません。

**更新** は、このリポジトリの最新のリリースの公式検出器をダウンロードします。自分で編集した組み込みの検出器が、確認なしに置き換えられることはありません：自分のバージョンと新しいバージョンのどちらかを選べます。組み込みの検出器を削除した場合は、同じメニューの **公式検出器を復元** で元に戻せます。検出器の更新はスケジュールに従って実行することもできます（**設定 → 一般**）。

### 詳細

ページで使われている保護機能のための、実践的なツールです。保護機能が 50% を超える信頼度で検出されると、そのツールが使えるようになります。この下限は **設定 → 検出 → 高度なツール** で変更できます。ページに条件を満たすものがない場合、タブはその旨と、その下限（またはそれを下回って見つかった保護機能の名前）を示し、対応している 25 の保護機能を表示します。

| 保護機能 | ツール |
| --- | --- |
| Akamai Bot Manager | Check Cookies · Analyze Scripts · Extract Sensor Information · Start Capturing |
| AWS WAF | Check Cookies · Analyze Scripts |
| Cloudflare Bot Management | Check Cookies · Analyze Scripts |
| Cloudflare Turnstile | Extract SiteKey · Analyze Scripts |
| DataDome | Check Cookies · Analyze Scripts |
| FunCaptcha (Arkose Labs) | Extract Public Key · Analyze Scripts · Start Capturing |
| GeeTest | Check Version · Analyze Scripts |
| Google reCAPTCHA | Obtain Selector · Extract SiteKey · reCAPTCHA callback · Start Capturing |
| hCaptcha | Extract SiteKey · Check Version · Analyze Scripts · Start Capturing |
| Incapsula (Imperva) | Check Cookies · Analyze Scripts · Start Capturing |
| Shape Security | Check Version · Check Cookies · Analyze Scripts · Start Capturing |
| Aliyun Captcha 2.0, Captcha.eu, Capy Puzzle Captcha, Dingxiang Captcha, Friendly Captcha, MTCaptcha, NetEase Yidun, Prosopo Procaptcha, QCloud Captcha, Shumei Captcha, Yandex SmartCaptcha | Extract SiteKey · Analyze Scripts |
| AliExpress CAPTCHA, Basilisk Captcha, Binance Captcha | Analyze Scripts |

結果とキャプチャは **詳細 → 履歴** に 30 分間保存され、そこでサイト、ベンダー、ツールで絞り込んだり、再度開いたり、エクスポートしたりできます。

### 設定

- **一般：** インターフェースの言語（22 言語。デフォルトではブラウザに従います）、テーマ（ダーク、ライト、システム）、通知、デバッグモード、検出器の定期的な更新、そしてバッジ、カテゴリ、タグの色。
- **検出：** キャッシュの期間と範囲、結果のカテゴリの並び順、高度なツールの信頼度の下限、どのサイトをスキャンするか（除外したサイト以外のすべてのサイト、または選んだサイトだけ）、JS API イベント、Webhook、共有リンク。
- **履歴：** 何を記録するか（履歴の一時停止、プライベートウィンドウの除外、無視するサイト、最小の信頼度、フィンガープリンティングだけのページの除外）、いくつのエントリーを保持するか（最大 10,000。0 にすると最新の 1,000 件を保持）、日数の経過後またはブラウザを閉じたときのエントリーの削除、繰り返しのスキャンの除外または更新、ページの保護機能が変化したときの通知、デフォルトのエクスポートの形式、警告付きのストレージのメーター、ダウンロードフォルダーへの自動バックアップ。

  履歴の上限は約 6 MB で、**設定 → 履歴** でより大きなサイズを選ぶと 12 MB または 25 MB になります。いっぱいになると、固定されていない最も古いエントリーから削除され、**設定 → 履歴** にその件数が表示されます。難易度の高い保護機能や、指定した保護機能があるページは、自動的に固定できます（最大 50 件）。フィンガープリンティングだけのページは、独自の日数の経過後に削除できます。また、最大 10 件の固定したページを監視できます：バックグラウンドのタブで毎日または毎週再度スキャンされ、保護機能が変化するとエントリーに「変化あり」の印が付きます（各チェックは、あなたの Cookie を使った実際の訪問です）。
- **データ：** 統計のページを開く、拡張機能の各部分が使っている容量を確認して、検出のキャッシュ、ツールのキャプチャ、ログ、履歴を消去する、設定、独自のルール、履歴を 1 つのファイルにバックアップして復元する、設定と履歴をエクスポートまたはインポートする、プライバシーまたは開発者のプリセットを適用するか、すべての設定をリセットする、バグ報告のための診断の概要をコピーする（サイト、アドレス、キーは含まれません）。

## 連携

### JavaScript のイベント

拡張機能はページの `window` 上でイベントを発行するので、あなた自身のスクリプト（またはテストハーネス）がその結果に反応できます：

| イベント | タイミング |
| --- | --- |
| `scrapfly:ready` | 拡張機能がページに読み込まれたとき |
| `scrapfly:onStart` | スキャンが開始したとき（キャッシュされた結果がない場合、または手動のスキャン） |
| `scrapfly:onProgress` | 1 つの検出方法が完了したとき |
| `scrapfly:onHooksComplete` | JavaScript のフックが監視を終えたとき |
| `scrapfly:onWindowPropsComplete` | Window のプロパティのチェックが完了したとき |
| `scrapfly:onDetection` | 結果の準備ができたとき（キャッシュから提供された結果を含む） |
| `scrapfly:onError` | スキャンが失敗したとき |

```js
const on = (ev, cb) =>
  addEventListener(`scrapfly:${ev}`, cb);

on('onDetection', (e) => {
  const { url, detections } = e.detail;
  console.log(url, detections);
});
```

これらのイベントはページ自体に届くため、訪問したどの Web サイトもそれを受け取って、拡張機能がインストールされていることを知ることができます。デフォルトではオフになっています。**設定 → 検出 → JS API イベント** でオンにしてください。

### Webhook

スキャンで保護機能が見つかると、拡張機能は結果をあなた自身のエンドポイントに送信できます。HTTP のメソッドを選び、ヘッダーを追加し、`<SITEURL>`、`<HOSTNAME>`、`<TITLE>`、`<DETECTIONS>`、`<DETECTION_COUNT>`、`<DETECTION_NAMES>`（保護機能とその信頼度を 1 行で）、`<CATEGORIES>`、`<TIMESTAMP>` といった変数を使ったテンプレートとしてボディを書きます。**テンプレートから始める**（Slack、Mattermost または Google Chat、Discord、プレーンテキストの 1 行）を使うと、Content-Type と、すぐに使えるチャットのメッセージが入力されます。Webhook は公開ホスト上の HTTPS のアドレスにのみ送られ、デフォルトではオフで、**テスト** ボタンも付いています。**設定 → 検出 → Webhook連携** でセットアップしてください。

**最近の送信とリトライ。** **設定 → 検出 → Webhook** には、直近 20 回の試行（ページ、ステータス、かかった時間。アドレス、ヘッダー、ペイロードは決して表示されません）が一覧表示されます。失敗した送信は **再試行** で再送でき、**失敗した送信を再試行** がオン（デフォルト）の場合は、応答がなかったとき、またはサーバーが 408、425、429、5xx を返したときに、拡張機能が 1 分後、5 分後、15 分後に自動的にもう一度送信します。401、403、404 のような拒否の場合は、あなたの再試行を待ちます。そのために、失敗した送信のページのデータはメモリー上に 1 時間（最大 20 件）保持されます。ディスクには決して保存されず、ブラウザを閉じると消えます。リトライでは、現在の Webhook の設定からリクエストを組み立て直すので、修正したアドレスやシークレットが使われ、ヘッダーやシークレットが一緒に保存されることはありません。

**署名。** 署名用のシークレットを設定すると（または **生成** を押して、それをサーバーに **コピー** すると）、ボディのある各リクエストは、Scrapfly 自身の Webhook と同じ方法で署名されます：`X-Scrapfly-Webhook-Signature` には、書かれたとおりのシークレット（その UTF-8 のバイト列。生成されたシークレットを 16 進数からデコードすることはありません）を鍵にした、生のボディの HMAC-SHA256 が大文字の 16 進数で入り、`X-Scrapfly-Webhook-Signature-Lowercase` には同じ値が小文字で入ります。パースする前に、定数時間の比較で生のボディと照合してください。GET、HEAD、`multipart/form-data` のリクエストは署名されず、URL が署名に含まれることはありません。タイムスタンプのヘッダーはありません。デフォルトのテンプレートはボディに `<TIMESTAMP>` を入れて送るので、サーバーで古いリクエストを拒否できます。シークレットはこのブラウザの中にとどまります：エクスポート、バックアップ、診断には含まれず、接続も削除しない限り、リセットしても保持されます。

```js
// Node.js, with the raw body as a Buffer (for example express.raw({ type: '*/*' }))
const crypto = require('node:crypto');
function isFromExtension(rawBody, signatureHeader, secret) {
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(String(signatureHeader || '').toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
// isFromExtension(req.body, req.get('X-Scrapfly-Webhook-Signature'), process.env.WEBHOOK_SECRET)
```

```python
import hashlib, hmac
def is_from_extension(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, (signature_header or "").lower())
```

### 共有リンク

検出タブの **検出結果をアップロード** は、ページの結果の概要を公開し、そのリンクをコピーして、新しいタブで開きます。概要には、クエリ文字列とフラグメントを除いたページのアドレス、各保護機能の名前、カテゴリ、信頼度、そしてどの方法が一致したかが含まれます。Cookie やヘッダーの値は決して含まれません。送信先と、サービスが許す場合はいつ削除されるかを、**設定 → 検出 → 共有アップロード** で選んでください：dpaste.com（デフォルト）、dpaste.org、paste.rs、API キーを使った Pastebin、トークンを使った非公開の GitHub Gist、または独自のサーバー。

## プライバシーと権限

検出は完全にブラウザの中で実行されます。アカウントもアナリティクスもなく、訪問したページについての情報が Scrapfly に送信されることはありません。拡張機能はいくつかのネットワークリクエストを行うので、それが何かを知っておいてください：

- **スクリプトの内容。** スクリプトのコードを読むために、ページのスクリプトとスタイルシートを、ブラウザのキャッシュを通じて、Cookie なしで再度ダウンロードします。
- **検出器の更新。** **更新**、またはオプションのスケジュールでは、`api.github.com` にこのリポジトリの最新のリリースを問い合わせ、そのリリースの検出器のファイルを `raw.githubusercontent.com` から読み込みます。
- **サイトのアイコン。** 履歴やその他の一覧には、サイト自身のファビコンが表示され、サイトにファビコンがない場合は Google のファビコンサービスに問い合わせます。
- **言語の国旗。** 設定の言語の選択肢は、国旗を `flagcdn.com` から読み込みます。
- **使うときだけ：** 上で説明した Webhook と共有リンク。JS API イベントがブラウザの外に出ることはありませんが、訪問したページはそれを読み取れます（[JavaScript のイベント](#javascript-のイベント)を参照）。

<details>
<summary><b>拡張機能が各権限を必要とする理由</b></summary>
<br>

| 権限 | 用途 |
| --- | --- |
| すべてのサイトへのアクセス（`http://*/*`、`https://*/*`） | 開いたページのスキャン |
| `storage` | 設定、検出器、履歴、キャッシュされた結果 |
| `tabs`、`activeTab` | ポップアップがどのページについてのものかを知ることと、統計の表示などのページを開くこと |
| `scripting` | ページ内での高度なツールの実行 |
| `webRequest` | 検出とキャプチャのための、リクエストの URL、ヘッダー、リクエストのボディの読み取り |
| `webNavigation` | ページやフレームの読み込みが完了したときを知ること |
| `cookies` | HttpOnly のものを含む Cookie の読み取り。一部の Analyze ツールは、ページを再読み込みする前に保護機能の Cookie をリセットします |
| `notifications` | キャプチャツールからのステータスのメッセージ |
| `downloads` | エクスポートしたファイルの保存 |
| `alarms` | 検出器の定期的な更新と、古い履歴やキャッシュされた結果のクリーンアップ |
| `unlimitedStorage` | **設定 → 履歴** で 12 MB または 25 MB を選んだときに、履歴がブラウザの 10 MB の割り当てを超えられるようにします。より大きなサイズを選ばない限り、履歴は 6 MB のままです |

</details>

## 開発とコントリビュート

開発者向けのドキュメントは、内容が古くならないよう英語でのみ提供しています：[開発とチェック](../README.md#development)、[検出器の書き方](../README.md#writing-a-detector)、[コントリビュートの方法](../README.md#contributing)。バグの報告や検出器の改善は、どの言語でも歓迎します：ページのアドレスと、何が表示されると期待していたかを添えて、[Issue を作成](https://github.com/scrapfly/Antibot-Detector/issues)してください。

## ライセンス

[Non-Profit Open Software License 3.0](../LICENSE)（NPOSL-3.0）のもとで公開されています。

Copyright © 2026 Scrapfly.
