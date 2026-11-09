[English](../fastly.md) | [Español](../es/fastly.md) | [Русский](../ru/fastly.md) | [简体中文](../zh-CN/fastly.md) | [日本語](../ja/fastly.md) | [Português (Brasil)](../pt-BR/fastly.md) | **Deutsch** | [Français](../fr/fastly.md) | [한국어](../ko/fastly.md)

# Fastly Bot Management Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Fastly Bot Management ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Fastly Bot Management umgehen möchten, Fastly Bot Management auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Fastly Bot Management blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Fastly Bot Management Ihre Anfragen beantwortet. Diese Seite listet die 6 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Fastly Bot Management identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Fastly Bot Management ist das Bot-Erkennungsprodukt von Fastly, einem Edge-Cloud-Anbieter. Es wird über das Edge-Netzwerk von Fastly bereitgestellt und kann laut seinem Detektor auch clientseitige Prüfungen ausführen.

Offizielle Website: [https://www.fastly.com/products/bot-management](https://www.fastly.com/products/bot-management)

## Woran erkenne ich, ob eine Website Fastly Bot Management nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-fastly` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^_fs_ch_st_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge start cookie (_fs_ch_st_<random>) |
| `^_fs_ch_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge complete cookie (_fs_ch_cp_<random>) |
| `^_fs_cd_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/challenge\.js(?:[?#]\|$)` | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/assets/[A-Za-z0-9_.-]{1,64}\.js(?:[?#]\|$)` | 100% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `div.fastly-challenge` | 40% | Embedded Fastly dynamic challenge container (div.fastly-challenge) |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Fastly challenge script with its cookie or container | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path und (Fastly challenge start cookie (_fs_ch_st_<random>) oder Fastly challenge complete cookie (_fs_ch_cp_<random>) oder Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly challenge complete cookie with its start cookie or container | 95% | Fastly challenge complete cookie (_fs_ch_cp_<random>) und (Fastly challenge start cookie (_fs_ch_st_<random>) oder Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly detection script with its cookie | 95% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path und Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |
| Fastly challenge container with its start cookie | 90% | Embedded Fastly dynamic challenge container (div.fastly-challenge) und Fastly challenge start cookie (_fs_ch_st_<random>) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Fastly Bot Management im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Fastly Bot Management geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Fastly Bot Management mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
