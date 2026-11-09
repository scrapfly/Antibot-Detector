[English](../iovation.md) | [Español](../es/iovation.md) | [Русский](../ru/iovation.md) | [简体中文](../zh-CN/iovation.md) | [日本語](../ja/iovation.md) | [Português (Brasil)](../pt-BR/iovation.md) | **Deutsch** | [Français](../fr/iovation.md) | [한국어](../ko/iovation.md)

# iovation (TransUnion TruValidate) Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

iovation (TransUnion TruValidate) ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie iovation (TransUnion TruValidate) umgehen möchten, iovation (TransUnion TruValidate) auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von iovation (TransUnion TruValidate) blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich iovation (TransUnion TruValidate) Ihre Anfragen beantwortet. Diese Seite listet die 9 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von iovation (TransUnion TruValidate) identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

iovation ist ein Dienst für Geräteerkennung und Betrugsprävention, der inzwischen als TruValidate zu TransUnion gehört. Sein Skript sammelt eine Geräte-Blackbox, die die Website bei sensiblen Aktionen mit übermittelt.

Offizielle Website: [https://www.iovation.com/](https://www.iovation.com/)

## Woran erkenne ich, ob eine Website iovation (TransUnion TruValidate) nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-iovation` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (nur zur Bestätigung) | iovation logo.js served through the site's own /iojs/ proxy |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (nur zur Bestätigung) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (nur zur Bestätigung) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (nur zur Bestätigung) | io_global_object_name setting read by the iovation scripts |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (nur zur Bestätigung) | Hidden ioBlackBox field that receives the iovation blackbox |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) oder iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) und (IGLOO.getBlackbox function of the iovation loader oder IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy oder iovation logo.js served through the site's own /iojs/ proxy) und (IGLOO.getBlackbox function of the iovation loader oder IGLOO.fp object created by the iovation profiling scripts oder io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader oder IGLOO.fp object created by the iovation profiling scripts) und (io_global_object_name setting read by the iovation scripts oder iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) oder Hidden ioBlackBox field that receives the iovation blackbox) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn iovation (TransUnion TruValidate) im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch iovation (TransUnion TruValidate) geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet iovation (TransUnion TruValidate) mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
