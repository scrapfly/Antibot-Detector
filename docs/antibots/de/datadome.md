[English](../datadome.md) | [Español](../es/datadome.md) | [Русский](../ru/datadome.md) | [简体中文](../zh-CN/datadome.md) | [日本語](../ja/datadome.md) | [Português (Brasil)](../pt-BR/datadome.md) | **Deutsch** | [Français](../fr/datadome.md) | [한국어](../ko/datadome.md)

# DataDome Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

DataDome ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie DataDome umgehen möchten, DataDome auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von DataDome blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich DataDome Ihre Anfragen beantwortet. Diese Seite listet die 11 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von DataDome identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

DataDome ist ein französischer Anbieter für Bot- und Online-Betrugsschutz. Er bewertet Anfragen mit einem JavaScript-Tag und serverseitigen Signalen und kann mit einer Challenge oder einer Blockseite antworten.

Offizielle Website: [https://datadome.co/](https://datadome.co/)

## Woran erkenne ich, ob eine Website DataDome nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-datadome` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (nur zur Bestätigung) | DataDome block-type header on challenge responses |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/(?:tags\.js\|js/)` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:geo\|ct\|c\|t)\.captcha-delivery\.com/` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (nur zur Bestätigung) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (nur zur Bestätigung) | DataDome block page bootstrap (var dd={'rt':...}) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint oder DataDome JS key set by the integration snippet oder Integration snippet setting window.ddjskey) und DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header oder DataDome protection response header oder Response served by DataDome itself (block or challenge page)) und DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only und (DataDome JS key set by the integration snippet oder Integration snippet setting window.ddjskey) |
| DataDome block page | 95% | DataDome block page bootstrap (var dd={'rt':...}) und (DataDome client ID response header oder DataDome block-type header on challenge responses oder DataDome challenge or CAPTCHA delivery host oder DataDome session cookie) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn DataDome im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch DataDome geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet DataDome mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
