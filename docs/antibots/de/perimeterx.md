[English](../perimeterx.md) | [Español](../es/perimeterx.md) | [Русский](../ru/perimeterx.md) | [简体中文](../zh-CN/perimeterx.md) | [日本語](../ja/perimeterx.md) | [Português (Brasil)](../pt-BR/perimeterx.md) | **Deutsch** | [Français](../fr/perimeterx.md) | [한국어](../ko/perimeterx.md)

# HUMAN (PerimeterX) Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

HUMAN (PerimeterX) ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie HUMAN (PerimeterX) umgehen möchten, HUMAN (PerimeterX) auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von HUMAN (PerimeterX) blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich HUMAN (PerimeterX) Ihre Anfragen beantwortet. Diese Seite listet die 22 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von HUMAN (PerimeterX) identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

PerimeterX gehört inzwischen zu HUMAN Security. Sein Bot Defender platziert ein Skript auf der Seite, bewertet Besucher anhand von Verhaltens- und Gerätesignalen und kann mit einer Challenge im Stil von „gedrückt halten“ antworten.

Offizielle Website: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## Woran erkenne ich, ob eine Website HUMAN (PerimeterX) nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-perimeterx` erzeugt (Regelversion 2.4.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (nur zur Bestätigung) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| `^(?:_pxmvid\|_pxttld\|_pxwvm\|_pxmd\|_pxda\|_pxac)$` | 60% | Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac) |
| `^__pxvid$` | 60% | HUMAN Code Defender visitor cookie (__pxvid) |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (nur zur Bestätigung) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |
| `^https://(?:[a-z0-9-]+\.)+(?:px-cloud\.net\|px-cdn\.net\|px-client\.net\|pxchk\.net\|perimeterx\.net\|hsprotect\.net)(?:[/?#:]\|$)` | 100% | Request to a HUMAN (PerimeterX) sensor, collector or challenge host |
| `^https?://[^/?#]+/(?:PX)?[A-Za-z0-9]{8}/xhr/api/v[0-9]/collector(?:[/?#]\|$)` | 85% | First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector) |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/init\.js(?:[?#]\|$)` | 30% (nur zur Bestätigung) | First-party init.js under an app-ID path without the PX prefix; corroboration only |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (nur zur Bestätigung) | Optional PerimeterX init callback defined by the site |
| `_pxUuid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxVid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxBlockedUrl (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxJsClientSrc (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `div#px-captcha` | 60% | HUMAN challenge container (div#px-captcha) |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID oder First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) oder PerimeterX application ID oder PerimeterX collector endpoint) und (PerimeterX risk token cookie (_px2 or _px3) oder PerimeterX first-party server cookie oder PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | mindestens 2 von: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host und (PerimeterX application ID oder Script assigning the PerimeterX app ID (window._pxAppId) oder Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) und (PerimeterX application ID oder Script assigning the PerimeterX app ID (window._pxAppId) oder Optional PerimeterX init callback defined by the site) |
| First-party HUMAN sensor with its app ID or cookies | 95% | (First-party init.js under an app-ID path without the PX prefix; corroboration only oder First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector)) und (PerimeterX application ID oder Script assigning the PerimeterX app ID (window._pxAppId) oder Optional PerimeterX init callback defined by the site oder Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) oder Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac)) |
| HUMAN block page with its challenge | 95% | (HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) oder HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) oder HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) oder HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) oder HUMAN challenge container (div#px-captcha)) und (PerimeterX challenge (Press & Hold) script host oder First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) oder Request to a HUMAN (PerimeterX) sensor, collector or challenge host) |

## Schwierigkeit

**Hoch.** Hoch bedeutet, dass die Erweiterung diesen Schutz zu den am schwersten zu überwindenden zählt: Er kombiniert in der Regel clientseitige Prüfungen mit verhaltensbasierter oder serverseitiger Bewertung.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn HUMAN (PerimeterX) im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch HUMAN (PerimeterX) geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet HUMAN (PerimeterX) mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
