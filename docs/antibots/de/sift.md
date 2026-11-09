[English](../sift.md) | [Español](../es/sift.md) | [Русский](../ru/sift.md) | [简体中文](../zh-CN/sift.md) | [日本語](../ja/sift.md) | [Português (Brasil)](../pt-BR/sift.md) | **Deutsch** | [Français](../fr/sift.md) | [한국어](../ko/sift.md)

# Sift Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Sift ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Sift umgehen möchten, Sift auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Sift blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Sift Ihre Anfragen beantwortet. Diese Seite listet die 6 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Sift identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Sift ist eine Plattform für digitales Vertrauen und Betrugsprävention. Sein Seiten-Snippet meldet Geräte- und Seitenaufrufdaten zur Risikobewertung an Sift.

Offizielle Website: [https://sift.com/](https://sift.com/)

## Woran erkenne ich, ob eine Website Sift nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-sift` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^__ssid$` | 30% (nur zur Bestätigung) | __ssid visitor cookie the Sift snippet sets |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://cdn\.(?:sift\|siftscience)\.com/(?:s\|js/s-\d+)\.js(?:[?#]\|$)` | 100% | Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host |
| `^https://hexagon-analytics\.com/images/\d+\.gif\?` | 100% | Sift page-view beacon to hexagon-analytics.com (images/<n>.gif) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_sift\.push\(\s*\[\s*['\"]_setAccount['\"]` | 20% | Sift snippet account call in scripts (_sift.push(['_setAccount', ...])) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_sift (typeof object)` | 30% (nur zur Bestätigung) | _sift command queue of the Sift snippet |
| `Sift (typeof string)` | 40% (nur zur Bestätigung) | Sift global the Sift s.js sets once loaded |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Sift script or beacon with its runtime or cookie | 100% | (Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host oder Sift page-view beacon to hexagon-analytics.com (images/<n>.gif)) und (_sift command queue of the Sift snippet oder Sift global the Sift s.js sets once loaded oder __ssid visitor cookie the Sift snippet sets) |
| Sift command queue with the loaded s.js | 80% | _sift command queue of the Sift snippet und Sift global the Sift s.js sets once loaded |
| __ssid cookie with the Sift runtime | 85% | __ssid visitor cookie the Sift snippet sets und (_sift command queue of the Sift snippet oder Sift global the Sift s.js sets once loaded oder Sift snippet account call in scripts (_sift.push(['_setAccount', ...]))) |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Sift im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Sift geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Sift mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
