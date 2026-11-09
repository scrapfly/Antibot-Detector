[English](../wordfence.md) | [Español](../es/wordfence.md) | [Русский](../ru/wordfence.md) | [简体中文](../zh-CN/wordfence.md) | [日本語](../ja/wordfence.md) | [Português (Brasil)](../pt-BR/wordfence.md) | **Deutsch** | [Français](../fr/wordfence.md) | [한국어](../ko/wordfence.md)

# Wordfence Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Wordfence ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Wordfence umgehen möchten, Wordfence auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Wordfence blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Wordfence Ihre Anfragen beantwortet. Diese Seite listet die 19 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Wordfence identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Wordfence ist ein beliebtes WordPress-Sicherheits-Plugin. Es ergänzt eine einzelne WordPress-Website um eine Firewall, Ratenbegrenzung und Anmeldeschutz.

Offizielle Website: [https://www.wordfence.com/](https://www.wordfence.com/)

## Woran erkenne ich, ob eine Website Wordfence nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-wordfence` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^wfwaf-authcookie-[0-9a-f]{32}$` | 60% | Wordfence firewall cookie wfwaf-authcookie-<hash> set for logged-in users |
| `^wf_loginalerted_[0-9a-f]{64}$` | 60% | Wordfence new-device login alert cookie wf_loginalerted_<hash> |
| `^wfls-remembered-[A-Za-z0-9_-]{20,24}$` | 60% | Wordfence Login Security cookie wfls-remembered-<id> for a device that passed 2FA |
| `^wfCBLBypass$ = ^[0-9a-f]{13}$` | 60% | Wordfence country blocking bypass cookie wfCBLBypass |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence(?:-login-security)?/(?:modules/login-security/)?js/(?:login\|wflsi18n)\.\d+(?:\.min)?\.js(?:[?#]\|$)` | 90% | Wordfence Login Security login script or its translations |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence/(?:js\|css)/[\w.-]+\.(?:js\|css)(?:[?#]\|$)` | 80% | Script or stylesheet from the Wordfence plugin's own js or css folder |
| `^https?://[^/?#]+/(?:[^?#]*/)?\?wordfence_lh=1&hid=` | 50% | Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `WFLSVars` | 30% | Script defining WFLSVars, the Wordfence Login Security settings |
| `WFAJAXWatcherVars` | 30% | Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings |
| `wfLogHumanRan` | 20% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) |
| `_wfsf=unlockEmail` | 20% | Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) |
| `user-reports.wordfence` | 20% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `WFLSVars (typeof object)` | 60% | Wordfence Login Security settings object |
| `WFLSVars.useCAPTCHA (truthy)` | 60% | Wordfence Login Security reCAPTCHA turned on |
| `wordfenceAJAXWatcher (typeof object)` | 60% | Wordfence firewall watcher object |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `a[href="https://www.wordfence.com/help/?query=locked-out"]` | 30% (nur zur Bestätigung) | Locked-out documentation link on the Wordfence block page |
| `input#unlock-email` | 20% (nur zur Bestätigung) | Unlock email field on the Wordfence block page |
| `input[name="wfwaf-false-positive-verified"]` | 50% | Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins |
| `a#reportButton` | 10% (nur zur Bestätigung) | Report Problem button on the Wordfence blocklist page |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Login Security script with its settings | 100% | Wordfence Login Security login script or its translations und (Wordfence Login Security settings object oder Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security with reCAPTCHA turned on | 100% | Wordfence Login Security reCAPTCHA turned on und (Wordfence Login Security login script or its translations oder Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security settings in a script and at runtime | 90% | Script defining WFLSVars, the Wordfence Login Security settings und Wordfence Login Security settings object |
| Live Traffic script and its report request | 85% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) und Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |
| Firewall watcher script with its settings | 90% | Script or stylesheet from the Wordfence plugin's own js or css folder und (Wordfence firewall watcher object oder Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings) |
| Wordfence block page help link with its unlock form or allowlist field | 85% | Locked-out documentation link on the Wordfence block page und (Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) oder Unlock email field on the Wordfence block page oder Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins) |
| Wordfence blocklist page report script and button | 80% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) und Report Problem button on the Wordfence blocklist page |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Wordfence im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Wordfence geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Wordfence mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
