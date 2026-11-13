[English](../radware.md) | [Español](../es/radware.md) | [Русский](../ru/radware.md) | [简体中文](../zh-CN/radware.md) | [日本語](../ja/radware.md) | [Português (Brasil)](../pt-BR/radware.md) | **Deutsch** | [Français](../fr/radware.md) | [한국어](../ko/radware.md)

# Radware Bot Manager Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Radware Bot Manager ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Radware Bot Manager umgehen möchten, Radware Bot Manager auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Radware Bot Manager blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Radware Bot Manager Ihre Anfragen beantwortet. Diese Seite listet die 10 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Radware Bot Manager identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Radware Bot Manager, früher ShieldSquare, ist das Bot-Management-Produkt von Radware. Radware vertreibt außerdem eine Cloud-WAF, und der Detektor sucht nach Spuren beider.

Offizielle Website: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## Woran erkenne ich, ob eine Website Radware Bot Manager nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-radware` erzeugt (Regelversion 2.3.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (nur zur Bestätigung) | Radware Bot Manager cookies written by its JavaScript |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `CloudWebSec[.@]radware\.com` | 20% (nur zur Bestätigung) | CloudWebSec contact address on the Radware block page |
| `Unauthorized Request Blocked` | 20% (nur zur Bestätigung) | Radware block-page message |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | CloudWebSec contact address on the Radware block page und Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header und (CloudWebSec contact address on the Radware block page oder Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header und CloudWebSec contact address on the Radware block page und Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) und First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) und First-party Radware Bot Manager script (stormcaster.js) und Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host und Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge und (Radware Bot Manager session cookies (__uzma … __uzmf) oder Radware Bot Manager cookies written by its JavaScript) |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Radware Bot Manager im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Radware Bot Manager geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Radware Bot Manager mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
