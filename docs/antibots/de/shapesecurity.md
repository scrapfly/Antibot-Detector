[English](../shapesecurity.md) | [Español](../es/shapesecurity.md) | [Русский](../ru/shapesecurity.md) | [简体中文](../zh-CN/shapesecurity.md) | [日本語](../ja/shapesecurity.md) | [Português (Brasil)](../pt-BR/shapesecurity.md) | **Deutsch** | [Français](../fr/shapesecurity.md) | [한국어](../ko/shapesecurity.md)

# Shape Security Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Shape Security ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Shape Security umgehen möchten, Shape Security auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Shape Security blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Shape Security Ihre Anfragen beantwortet. Diese Seite listet die 5 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Shape Security identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Shape Security, von F5 übernommen, entwickelte eine Bot-Abwehr für Unternehmen gegen Betrug, Credential Stuffing und Automatisierung bei Anmelde- und Checkout-Abläufen.

Offizielle Website: [https://www.shapesecurity.com/products/bot-manager](https://www.shapesecurity.com/products/bot-manager)

## Woran erkenne ich, ob eine Website Shape Security nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-shapesecurity` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?seed=[A-Za-z0-9_-]{40,}` | 85% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{0,60}/ssx\.mod\.js(?:\?async)?(?:#\|$)` | 60% (nur zur Bestätigung) | Shape ssx.mod.js loader (Target, Nordstrom) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?X-[A-Za-z0-9]{6,10}--z=q(?:&\|#\|$)` | 50% (nur zur Bestätigung) | Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `__xr_bmobdb` | 10% | Shape runtime global reference |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `__xr_bmobdb (exists)` | 80% | Shape runtime global (__xr_bmobdb) |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Seeded loader with its runtime | 100% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) und (Shape runtime global (__xr_bmobdb) oder Shape runtime global reference oder Shape seeded-script marker parameter (X-xxxxxxxx--z=q)) |
| ssx.mod.js loader with the Shape runtime | 90% | Shape ssx.mod.js loader (Target, Nordstrom) und (Shape runtime global (__xr_bmobdb) oder Shape loader with its long seed parameter (ssx.mod.js?seed=...)) |
| ssx.mod.js loader with the seeded-script marker | 80% | Shape ssx.mod.js loader (Target, Nordstrom) und Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

## Schwierigkeit

**Hoch.** Hoch bedeutet, dass die Erweiterung diesen Schutz zu den am schwersten zu überwindenden zählt: Er kombiniert in der Regel clientseitige Prüfungen mit verhaltensbasierter oder serverseitiger Bewertung.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Shape Security im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Shape Security geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Shape Security mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
