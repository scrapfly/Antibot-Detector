[English](../anubis.md) | [Español](../es/anubis.md) | [Русский](../ru/anubis.md) | [简体中文](../zh-CN/anubis.md) | [日本語](../ja/anubis.md) | [Português (Brasil)](../pt-BR/anubis.md) | **Deutsch** | [Français](../fr/anubis.md) | [한국어](../ko/anubis.md)

# Anubis Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Anubis ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Anubis umgehen möchten, Anubis auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Anubis blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Anubis Ihre Anfragen beantwortet. Diese Seite listet die 6 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Anubis identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Anubis ist ein quelloffenes Web-Gate von Techaro, das den Browser jedes neuen Besuchers ein kleines Proof-of-Work-Rätsel lösen lässt, bevor die Seite geladen wird. Es wurde entwickelt, um KI-Crawler auszubremsen, und wird von vielen Open-Source- und Community-Websites eingesetzt.

Offizielle Website: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## Woran erkenne ich, ob eine Website Anubis nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-anubis` erzeugt (Regelversion 2.1.1, zuletzt aktualisiert am 2026-10-30). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (nur zur Bestätigung) | Proof-of-work progress bar inner element on the challenge page |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint und (Anubis mascot image (pensive/happy/reject) loaded from the command endpoint oder Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) oder Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix)) und Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) und Anubis main challenge module loaded from the command endpoint und Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Anubis im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Anubis geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Anubis mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
