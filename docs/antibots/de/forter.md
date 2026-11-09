[English](../forter.md) | [Español](../es/forter.md) | [Русский](../ru/forter.md) | [简体中文](../zh-CN/forter.md) | [日本語](../ja/forter.md) | [Português (Brasil)](../pt-BR/forter.md) | **Deutsch** | [Français](../fr/forter.md) | [한국어](../ko/forter.md)

# Forter Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Forter ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Forter umgehen möchten, Forter auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Forter blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Forter Ihre Anfragen beantwortet. Diese Seite listet die 7 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Forter identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Forter ist ein Anbieter zur Betrugsprävention im Onlinehandel. Sein Skript erstellt einen Fingerprint des Browsers, und die Website sendet das resultierende Token bei Entscheidungen zu Checkout und Anmeldung mit.

Offizielle Website: [https://www.forter.com/](https://www.forter.com/)

## Woran erkenne ich, ob eine Website Forter nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-forter` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^forterToken$` | 90% | forterToken cookie set by the Forter script |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://[0-9a-f]{12}\.cdn4\.forter\.com/sns?/[0-9a-f]{12}/(?:[^?#]*/)?script\.js(?:[?#]\|$)` | 100% | Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) |
| `^https://(?:[0-9a-f-]+\.)?cdn\d*\.forter\.com/(?:events\|[^?#]*\.json)(?:[?#]\|$)` | 100% | Forter collection request to a forter.com CDN host (prop.json, wpt.json, events) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `\bftr__(?:startScriptLoad\|config)\b` | 20% (nur zur Bestätigung) | Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `ftr__config (typeof object)` | 60% | ftr__config object set by the Forter loader snippet |
| `ftr__startScriptLoad (typeof number)` | 50% (nur zur Bestätigung) | ftr__startScriptLoad timestamp set by the Forter loader snippet |
| `ftr__JSON3 (typeof object)` | 50% (nur zur Bestätigung) | ftr__JSON3 object set by the Forter script |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Forter script with its token cookie or config | 100% | (Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) oder Forter collection request to a forter.com CDN host (prop.json, wpt.json, events)) und (forterToken cookie set by the Forter script oder ftr__config object set by the Forter loader snippet) |
| forterToken cookie with the Forter runtime | 100% | forterToken cookie set by the Forter script und (ftr__config object set by the Forter loader snippet oder ftr__startScriptLoad timestamp set by the Forter loader snippet oder ftr__JSON3 object set by the Forter script oder Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config)) |
| Forter loader globals together | 85% | ftr__config object set by the Forter loader snippet und (ftr__startScriptLoad timestamp set by the Forter loader snippet oder ftr__JSON3 object set by the Forter script) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Forter im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Forter geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Forter mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
