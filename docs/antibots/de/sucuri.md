[English](../sucuri.md) | [Español](../es/sucuri.md) | [Русский](../ru/sucuri.md) | [简体中文](../zh-CN/sucuri.md) | [日本語](../ja/sucuri.md) | [Português (Brasil)](../pt-BR/sucuri.md) | **Deutsch** | [Français](../fr/sucuri.md) | [한국어](../ko/sucuri.md)

# Sucuri WAF Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Sucuri WAF ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Sucuri WAF umgehen möchten, Sucuri WAF auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Sucuri WAF blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Sucuri WAF Ihre Anfragen beantwortet. Diese Seite listet die 8 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Sucuri WAF identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Sucuri ist ein Unternehmen für Websicherheit, dessen Cloud-WAF und CDN vor einer Website sitzen, um Angriffe und unerwünschten Traffic zu filtern.

Offizielle Website: [https://sucuri.net/](https://sucuri.net/)

## Woran erkenne ich, ob eine Website Sucuri WAF nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-sucuri` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (nur zur Bestätigung) | Sucuri cache status header |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `Sucuri Web ?Site Firewall - (?:CloudProxy - )?Access Denied\|Access Denied - Sucuri Web ?Site Firewall` | 30% (nur zur Bestätigung) | Sucuri block page title |
| `Block ID:` | 20% (nur zur Bestätigung) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title oder Block ID label on the Sucuri block page) und (Sucuri WAF node id header oder Sucuri block reason header oder Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header und (Sucuri WAF node id header oder Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable und (Sucuri CloudProxy JS-challenge cookie oder Sucuri WAF node id header oder Sucuri CloudProxy server header) |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Sucuri WAF im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Sucuri WAF geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Sucuri WAF mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
