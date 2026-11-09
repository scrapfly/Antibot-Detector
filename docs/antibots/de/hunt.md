[English](../hunt.md) | [Español](../es/hunt.md) | [Русский](../ru/hunt.md) | [简体中文](../zh-CN/hunt.md) | [日本語](../ja/hunt.md) | [Português (Brasil)](../pt-BR/hunt.md) | **Deutsch** | [Français](../fr/hunt.md) | [한국어](../ko/hunt.md)

# Hunt Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Hunt ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Hunt umgehen möchten, Hunt auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Hunt blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Hunt Ihre Anfragen beantwortet. Diese Seite listet die 4 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Hunt identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Hunt ist ein Anti-Bot-System, das auf einigen Wettplattformen zu sehen ist. Es erfasst einen Browser-Fingerprint und kann ein interaktives Captcha nachschalten, wenn es entscheidet, zu blockieren.

Offizielle Website: [https://docs.capmonster.cloud/docs/captchas/hunt-task/](https://docs.capmonster.cloud/docs/captchas/hunt-task/)

## Woran erkenne ich, ob eine Website Hunt nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-hunt` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-10-17). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/hd-api/external/apps/[0-9A-Za-z_-]+/api\.js(?:[?#]\|$)` | 60% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/assets/hdf\.js(?:[?#]\|$)` | 45% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/verify(?:[/?#]\|$)` | 50% | Hunt verify request that sends the browser check (hd-api/external/verify) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `/hd-api/external/apps/` | 15% | Script reference to the Hunt hd-api path |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Hunt loader with its fingerprint script | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host und Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| Hunt loader with a verify request | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host und Hunt verify request that sends the browser check (hd-api/external/verify) |
| Fingerprint script with a verify request | 85% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host und Hunt verify request that sends the browser check (hd-api/external/verify) |
| Hunt loader requested and referenced in page scripts | 75% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host und Script reference to the Hunt hd-api path |

## Schwierigkeit

**Hoch.** Hoch bedeutet, dass die Erweiterung diesen Schutz zu den am schwersten zu überwindenden zählt: Er kombiniert in der Regel clientseitige Prüfungen mit verhaltensbasierter oder serverseitiger Bewertung.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Hunt im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Hunt geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Hunt mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
