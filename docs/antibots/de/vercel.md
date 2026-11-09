[English](../vercel.md) | [Español](../es/vercel.md) | [Русский](../ru/vercel.md) | [简体中文](../zh-CN/vercel.md) | [日本語](../ja/vercel.md) | [Português (Brasil)](../pt-BR/vercel.md) | **Deutsch** | [Français](../fr/vercel.md) | [한국어](../ko/vercel.md)

# Vercel Firewall Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Vercel Firewall ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Vercel Firewall umgehen möchten, Vercel Firewall auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Vercel Firewall blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Vercel Firewall Ihre Anfragen beantwortet. Diese Seite listet die 9 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Vercel Firewall identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Vercel Firewall ist die Sicherheitsschicht der Hosting-Plattform Vercel. Sie umfasst konfigurierbare Regeln, eine Challenge-Seite im Attack Mode und eine BotID-Prüfung.

Offizielle Website: [https://vercel.com/docs/vercel-firewall](https://vercel.com/docs/vercel-firewall)

## Woran erkenne ich, ob eine Website Vercel Firewall nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-vercel` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-vercel-mitigated$: ^challenge$` | 100% | x-vercel-mitigated: challenge, the Vercel Firewall served its challenge |
| `^x-vercel-mitigated$: ^deny$` | 100% | x-vercel-mitigated: deny, the Vercel Firewall blocked the request |
| `^x-vercel-challenge-(?:token\|solution\|version)$` | 60% | x-vercel-challenge-token header of the Vercel Security Checkpoint |
| `^server$: ^Vercel$` | 15% (nur zur Bestätigung) | Hosted on Vercel; hosting, not bot protection on its own |
| `^x-vercel-id$` | 15% (nur zur Bestätigung) | Vercel request id header; present on any Vercel response |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/vercel/security/static/challenge(?:\.v[0-9]+)?(?:\.min)?\.js(?:[?#]\|$)` | 90% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ |
| `^https?://[^/?#]+/\.well-known/vercel/security/request-challenge(?:[?#]\|$)` | 50% (nur zur Bestätigung) | Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge |
| `^https?://[^/?#]+/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/(?:a-4-a/c\|p)\.js(?:[?#]\|$)` | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3` | 30% | BotID path written in the page's scripts |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Vercel Security Checkpoint on a Vercel response | 100% | (x-vercel-mitigated: challenge, the Vercel Firewall served its challenge oder x-vercel-mitigated: deny, the Vercel Firewall blocked the request oder Vercel Security Checkpoint script under /.well-known/vercel/security/static/) und (Hosted on Vercel; hosting, not bot protection on its own oder Vercel request id header; present on any Vercel response) |
| BotID script with its path in the page's scripts | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) und BotID path written in the page's scripts |
| Checkpoint script with its answer request or token | 95% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ und (Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge oder x-vercel-challenge-token header of the Vercel Security Checkpoint) |
| Checkpoint token or answer request on a Vercel response | 85% | (x-vercel-challenge-token header of the Vercel Security Checkpoint oder Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge) und (Hosted on Vercel; hosting, not bot protection on its own oder Vercel request id header; present on any Vercel response) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Vercel Firewall im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Vercel Firewall geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Vercel Firewall mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
