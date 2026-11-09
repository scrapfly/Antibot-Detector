[English](../cheq.md) | [Español](../es/cheq.md) | [Русский](../ru/cheq.md) | [简体中文](../zh-CN/cheq.md) | [日本語](../ja/cheq.md) | [Português (Brasil)](../pt-BR/cheq.md) | **Deutsch** | [Français](../fr/cheq.md) | [한국어](../ko/cheq.md)

# Cheq Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Cheq ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Cheq umgehen möchten, Cheq auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Cheq blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Cheq Ihre Anfragen beantwortet. Diese Seite listet die 12 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Cheq identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

CHEQ ist ein Go-to-Market-Sicherheitsunternehmen, das Schutz vor Bots, ungültigem Traffic und Betrug anbietet, vor allem für Werbe- und Marketing-Traffic.

Offizielle Website: [https://cheq.ai/](https://cheq.ai/)

## Woran erkenne ich, ob eine Website Cheq nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-cheq` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-10-17). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (nur zur Bestätigung) | Other CHEQ cookies |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (nur zur Bestätigung) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (nur zur Bestätigung) | CHEQ queue object (_cq) |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class oder CHEQ tag with its JSONP callback attribute oder CHEQ ClickTrue host (cheqzone.com)) und (CHEQ SDK global oder CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie oder Other CHEQ cookies) und (CHEQ queue object (_cq) oder CHEQ JSONP callback name oder CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host und (CHEQ visitor/session id cookie oder Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai) und (CHEQ SDK global oder CHEQ queue object (_cq) oder CHEQ visitor/session id cookie oder Other CHEQ cookies)) oder ((ClickTrue tag; served from a disguised random host, identified by its class oder CHEQ tag with its JSONP callback attribute oder CHEQ ClickTrue host (cheqzone.com)) und (CHEQ queue object (_cq) oder Other CHEQ cookies)) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Cheq im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Cheq geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Cheq mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
