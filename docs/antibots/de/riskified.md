[English](../riskified.md) | [Español](../es/riskified.md) | [Русский](../ru/riskified.md) | [简体中文](../zh-CN/riskified.md) | [日本語](../ja/riskified.md) | [Português (Brasil)](../pt-BR/riskified.md) | **Deutsch** | [Français](../fr/riskified.md) | [한국어](../ko/riskified.md)

# Riskified Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Riskified ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Riskified umgehen möchten, Riskified auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Riskified blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Riskified Ihre Anfragen beantwortet. Diese Seite listet die 4 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Riskified identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Riskified ist ein Unternehmen für Betrugsprävention im E-Commerce. Ein Skript in Onlineshops sendet Browser- und Sitzungsdaten, die seine Entscheidungen zu Zahlungs- und Kontomissbrauch stützen.

Offizielle Website: [https://www.riskified.com/](https://www.riskified.com/)

## Woran erkenne ich, ob eine Website Riskified nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-riskified` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://beacon\.riskified\.com/?\?(?:[^#]*&)?shop=[^&#]+` | 100% | Riskified beacon script from the vendor beacon.riskified.com host (shop=<store>&sid=<session>) |
| `^https://(?:c\.riskified\.com/e\.gif\|img\.riskified\.com/img/)` | 100% | Riskified beacon request to its c.riskified.com or img.riskified.com collector |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `RISKX.go (typeof function)` | 60% | RISKX.go function of the Riskified beacon |
| `RISKX.setSid (typeof function)` | 40% (nur zur Bestätigung) | RISKX.setSid session helper of the Riskified beacon |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Riskified beacon with its global or collector | 100% | Riskified beacon script from the vendor beacon.riskified.com host (shop=<store>&sid=<session>) und (RISKX.go function of the Riskified beacon oder RISKX.setSid session helper of the Riskified beacon oder Riskified beacon request to its c.riskified.com or img.riskified.com collector) |
| Riskified collector request with its global | 95% | Riskified beacon request to its c.riskified.com or img.riskified.com collector und (RISKX.go function of the Riskified beacon oder RISKX.setSid session helper of the Riskified beacon) |
| Riskified global with its session helper | 80% | RISKX.go function of the Riskified beacon und RISKX.setSid session helper of the Riskified beacon |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Riskified im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Riskified geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Riskified mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
