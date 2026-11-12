[English](../reblaze.md) | [Español](../es/reblaze.md) | [Русский](../ru/reblaze.md) | [简体中文](../zh-CN/reblaze.md) | [日本語](../ja/reblaze.md) | [Português (Brasil)](../pt-BR/reblaze.md) | **Deutsch** | [Français](../fr/reblaze.md) | [한국어](../ko/reblaze.md)

# Reblaze Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Reblaze ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Reblaze umgehen möchten, Reblaze auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Reblaze blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Reblaze Ihre Anfragen beantwortet. Diese Seite listet die 8 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Reblaze identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Reblaze ist eine Cloud-Plattform für Websicherheit, die eine Web Application Firewall, DDoS-Schutz und Bot-Management umfasst.

Offizielle Website: [https://www.reblaze.com/](https://www.reblaze.com/)

## Woran erkenne ich, ob eine Website Reblaze nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-reblaze` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^rbzid$` | 80% | Reblaze visitor id cookie |
| `^rbzsessionid$` | 100% | Reblaze session cookie |
| `^rbz(?!id$\|sessionid$)[a-z0-9_]{2,20}$` | 30% (nur zur Bestätigung) | Other rbz* cookies (not rbzid or rbzsessionid) |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9_-]{3,40}\.ac_v2\.lib\.js(?:[?#]\|$)` | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) |
| `^https?://[^/?#]+/c3650cdf-216a-4ba2-80b0-9d6c540b105e58d2670b-ea0f-484e-b88c-0e2c1499ec9bd71e4b42-8570-44e3-89b6-845326fa43b6(?:[?#]\|$)` | 100% | Reblaze passive challenge script at its fixed first-party path |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `rbzns` | 10% | Reblaze namespace in page scripts |
| `bereshit` | 20% (nur zur Bestätigung) | Reblaze challenge config key (rbzns.bereshit) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `rbzns (typeof object)` | 75% | Reblaze namespace object (window.rbzns) |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Challenge library with its namespace | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) und (Reblaze namespace object (window.rbzns) oder Reblaze namespace in page scripts oder Reblaze challenge config key (rbzns.bereshit)) |
| Reblaze cookies with its namespace or library | 90% | (Reblaze visitor id cookie oder Reblaze session cookie oder Other rbz* cookies (not rbzid or rbzsessionid)) und (Reblaze namespace object (window.rbzns) oder Reblaze active-challenge library (<name>.ac_v2.lib.js) oder Reblaze namespace in page scripts) |
| Reblaze id and session cookies | 85% | Reblaze visitor id cookie und (Reblaze session cookie oder Other rbz* cookies (not rbzid or rbzsessionid)) |
| Reblaze namespace running with its challenge config | 90% | Reblaze namespace object (window.rbzns) und Reblaze challenge config key (rbzns.bereshit) |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Reblaze im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Reblaze geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Reblaze mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
