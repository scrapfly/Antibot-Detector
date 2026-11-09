[English](../kasada.md) | [Español](../es/kasada.md) | [Русский](../ru/kasada.md) | [简体中文](../zh-CN/kasada.md) | [日本語](../ja/kasada.md) | [Português (Brasil)](../pt-BR/kasada.md) | **Deutsch** | [Français](../fr/kasada.md) | [한국어](../ko/kasada.md)

# Kasada Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Kasada ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Kasada umgehen möchten, Kasada auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Kasada blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Kasada Ihre Anfragen beantwortet. Diese Seite listet die 8 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Kasada identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Kasada ist ein Anbieter für Bot-Abwehr. Er führt clientseitige Prüfungen im Browser aus und hängt an spätere Anfragen einen Nachweis an, sodass Anfragen ohne diesen Nachweis wahrscheinlich abgelehnt werden.

Offizielle Website: [https://www.kasada.io/](https://www.kasada.io/)

## Woran erkenne ich, ob eine Website Kasada nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-kasada` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-kpsdk-ct$` | 100% | Kasada client token header on protected responses |
| `^x-kpsdk-(?:r\|cd\|st\|im\|v\|h)$` | 40% (nur zur Bestätigung) | Other Kasada response headers |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:ips\|p)\.js(?:[?#]\|$)` | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]{1,8}(?:\.js)?)?\?(?:[^#]*&)?(?:x-kpsdk-im\|KP_UIDz)=` | 40% (nur zur Bestätigung) | Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:tl\|fp\|mfc)(?:[?#]\|$)` | 100% | Kasada telemetry or fingerprint endpoint on the double-UUID path |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `KPSDK\.(?:configure\|start\|now)` | 10% | KPSDK API call in page scripts |
| `kpsdk-load` | 10% | Kasada load event name |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `KPSDK (typeof object)` | 75% | Kasada KPSDK object |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Client script with KPSDK running | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) und (Kasada KPSDK object oder KPSDK API call in page scripts oder Kasada load event name) |
| Kasada token headers with its script or interstitial | 100% | (Kasada client token header on protected responses oder Other Kasada response headers) und (Kasada client script on its double-UUID first-party path (ips.js or p.js) oder Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) oder Kasada telemetry or fingerprint endpoint on the double-UUID path) |
| Interstitial script with KPSDK query | 90% | Kasada client script on its double-UUID first-party path (ips.js or p.js) und Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Kasada im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Kasada geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Kasada mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
