[English](../cloudflare-waitingroom.md) | [Español](../es/cloudflare-waitingroom.md) | [Русский](../ru/cloudflare-waitingroom.md) | [简体中文](../zh-CN/cloudflare-waitingroom.md) | [日本語](../ja/cloudflare-waitingroom.md) | [Português (Brasil)](../pt-BR/cloudflare-waitingroom.md) | **Deutsch** | [Français](../fr/cloudflare-waitingroom.md) | [한국어](../ko/cloudflare-waitingroom.md)

# Cloudflare Waiting Room Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Cloudflare Waiting Room ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Cloudflare Waiting Room umgehen möchten, Cloudflare Waiting Room auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Cloudflare Waiting Room blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Cloudflare Waiting Room Ihre Anfragen beantwortet. Diese Seite listet die 3 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Cloudflare Waiting Room identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Cloudflare Waiting Room ist eine Funktion von Cloudflare, die Besucher in eine Warteschlange stellt, wenn eine Website mehr Traffic erwartet, als ihr Ursprungsserver bewältigen kann. Sie dient der Verkehrssteuerung und ist kein Bot-Detektor, doch die Warteschlangenseite stoppt dennoch einfache Scraper.

Offizielle Website: [https://developers.cloudflare.com/waiting-room/](https://developers.cloudflare.com/waiting-room/)

## Woran erkenne ich, ob eine Website Cloudflare Waiting Room nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-cloudflare-waitingroom` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^__cfwaitingroom$` | 100% | Waiting Room cookie that keeps the visitor's place in the queue |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^server$: ^cloudflare$` | 15% (nur zur Bestätigung) | Served through Cloudflare; CDN delivery, not a queue on its own |
| `^cf-ray$: ^[0-9a-f]{12,20}-[A-Z]{3,4}$` | 15% (nur zur Bestätigung) | Cloudflare request id header; present on any Cloudflare response |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Queue cookie on a Cloudflare response | 85% | Waiting Room cookie that keeps the visitor's place in the queue und Served through Cloudflare; CDN delivery, not a queue on its own |
| Queue cookie with a Cloudflare request id | 80% | Waiting Room cookie that keeps the visitor's place in the queue und Cloudflare request id header; present on any Cloudflare response |
| Queue cookie with Cloudflare server and request id | 100% | Waiting Room cookie that keeps the visitor's place in the queue und Served through Cloudflare; CDN delivery, not a queue on its own und Cloudflare request id header; present on any Cloudflare response |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Cloudflare Waiting Room im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Cloudflare Waiting Room geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Cloudflare Waiting Room mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
