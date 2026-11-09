[English](../ocule.md) | [Español](../es/ocule.md) | [Русский](../ru/ocule.md) | [简体中文](../zh-CN/ocule.md) | [日本語](../ja/ocule.md) | [Português (Brasil)](../pt-BR/ocule.md) | **Deutsch** | [Français](../fr/ocule.md) | [한국어](../ko/ocule.md)

# Ocule Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Ocule ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Ocule umgehen möchten, Ocule auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Ocule blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Ocule Ihre Anfragen beantwortet. Diese Seite listet die 3 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Ocule identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Ocule war ein Bot-Schutzdienst, der später von hCaptcha übernommen wurde. Seiten, die noch darauf verweisen, sind in der Regel alte Integrationen.

Offizielle Website: [https://ocule.io/](https://ocule.io/)

## Woran erkenne ich, ob eine Website Ocule nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-ocule` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-17). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://proxy\.ocule\.co\.uk/script\.js(?:[?#]\|$)` | 40% | Legacy Ocule loader script (host no longer resolves) |
| `^https://(?!proxy\.)(?:[a-z0-9-]{1,63}\.){0,4}ocule\.co\.uk/` | 20% (nur zur Bestätigung) | Other requests to the legacy ocule.co.uk host (not the loader) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `ocule.co.uk` | 5% | Reference to the legacy Ocule host |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Legacy loader with other Ocule traffic | 60% | Legacy Ocule loader script (host no longer resolves) und Other requests to the legacy ocule.co.uk host (not the loader) |
| Legacy loader referenced in page scripts | 50% | Legacy Ocule loader script (host no longer resolves) und Reference to the legacy Ocule host |
| Legacy Ocule host traffic and reference | 40% | Other requests to the legacy ocule.co.uk host (not the loader) und Reference to the legacy Ocule host |

## Schwierigkeit

**Hoch.** Hoch bedeutet, dass die Erweiterung diesen Schutz zu den am schwersten zu überwindenden zählt: Er kombiniert in der Regel clientseitige Prüfungen mit verhaltensbasierter oder serverseitiger Bewertung.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Ocule im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Ocule geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Ocule mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
