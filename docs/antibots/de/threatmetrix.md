[English](../threatmetrix.md) | [Español](../es/threatmetrix.md) | [Русский](../ru/threatmetrix.md) | [简体中文](../zh-CN/threatmetrix.md) | [日本語](../ja/threatmetrix.md) | [Português (Brasil)](../pt-BR/threatmetrix.md) | **Deutsch** | [Français](../fr/threatmetrix.md) | [한국어](../ko/threatmetrix.md)

# ThreatMetrix Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

ThreatMetrix ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie ThreatMetrix umgehen möchten, ThreatMetrix auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von ThreatMetrix blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich ThreatMetrix Ihre Anfragen beantwortet. Diese Seite listet die 6 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von ThreatMetrix identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

ThreatMetrix ist ein Dienst für Geräteidentifikation und Betrugsprävention, der inzwischen LexisNexis Risk Solutions gehört. Er erstellt ein Profil des Geräts des Besuchers und sendet das Ergebnis an eine Entscheidungs-Engine.

Offizielle Website: [https://www.threatmetrix.com/](https://www.threatmetrix.com/)

## Woran erkenne ich, ob eine Website ThreatMetrix nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-threatmetrix` erzeugt (Regelversion 2.3.0, zuletzt aktualisiert am 2026-10-17). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=` | 100% | ThreatMetrix profiling tag (fp/tags.js?org_id=...) |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/(?:check\.js\|clear\.png\|sym\.map\|ls_fp\.html)` | 100% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| `^https?://[^/?#]+/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=[A-Za-z0-9]{6,12}&(?:[^#]*&)?session_id=` | 50% (nur zur Bestätigung) | First-party (CNAME) ThreatMetrix tag with org_id and session_id |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `tmx_(?:profiling_started\|run_page_fingerprinting)` | 10% | ThreatMetrix profiling globals in scripts |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `tmx_profiling_started (typeof boolean)` | 70% | ThreatMetrix profiling flag |
| `tmx_run_page_fingerprinting (typeof function)` | 60% | ThreatMetrix page fingerprint function |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Profiling tag with its runtime | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) oder First-party (CNAME) ThreatMetrix tag with org_id and session_id) und (ThreatMetrix profiling flag oder ThreatMetrix page fingerprint function oder ThreatMetrix profiling globals in scripts) |
| Profiling tag with its follow-up resources | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) oder First-party (CNAME) ThreatMetrix tag with org_id and session_id) und ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| Profiling resource with its runtime | 85% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) und (ThreatMetrix profiling flag oder ThreatMetrix page fingerprint function) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn ThreatMetrix im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch ThreatMetrix geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet ThreatMetrix mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
