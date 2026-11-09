[English](../castle.md) | [Español](../es/castle.md) | [Русский](../ru/castle.md) | [简体中文](../zh-CN/castle.md) | [日本語](../ja/castle.md) | [Português (Brasil)](../pt-BR/castle.md) | **Deutsch** | [Français](../fr/castle.md) | [한국어](../ko/castle.md)

# Castle Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Castle ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Castle umgehen möchten, Castle auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Castle blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Castle Ihre Anfragen beantwortet. Diese Seite listet die 6 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Castle identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Castle ist ein Sicherheitsanbieter für Schutz vor Kontoübernahmen, Bots und Missbrauch. Sein Browser-Skript erzeugt ein Anfrage-Token, das die Website bei Anmeldungen und sensiblen Aktionen an die API von Castle sendet.

Offizielle Website: [https://castle.io/](https://castle.io/)

## Woran erkenne ich, ob eine Website Castle nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-castle` erzeugt (Regelversion 2.0.1, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^__cuid$` | 30% | __cuid device cookie Castle.js stores by default |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://cdn\.castle\.io/v2/castle\.js(?:[?#]\|$)` | 100% | Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) |
| `^https://m\.castle\.io/v1/monitor(?:[/?#]\|$)` | 100% | Castle.js event request to the vendor m.castle.io monitor endpoint |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `Castle.createRequestToken (typeof function)` | 60% | Castle.createRequestToken function of the Castle.js global |
| `Castle.injectTokenOnSubmit (typeof function)` | 50% (nur zur Bestätigung) | Castle.injectTokenOnSubmit form helper of the Castle.js global |
| `_castle (typeof function)` | 30% (nur zur Bestätigung) | _castle function set by the CDN castle.js |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Castle.js from its host with its cookie or global | 100% | (Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) oder Castle.js event request to the vendor m.castle.io monitor endpoint) und (__cuid device cookie Castle.js stores by default oder Castle.createRequestToken function of the Castle.js global oder _castle function set by the CDN castle.js) |
| __cuid cookie with Castle.js | 90% | __cuid device cookie Castle.js stores by default und (Castle.createRequestToken function of the Castle.js global oder Castle.injectTokenOnSubmit form helper of the Castle.js global oder _castle function set by the CDN castle.js oder Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) oder Castle.js event request to the vendor m.castle.io monitor endpoint) |
| Castle.js global with its helpers | 80% | Castle.createRequestToken function of the Castle.js global und Castle.injectTokenOnSubmit form helper of the Castle.js global |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Castle im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Castle geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Castle mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
