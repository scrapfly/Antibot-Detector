[English](../incapsula.md) | [Español](../es/incapsula.md) | [Русский](../ru/incapsula.md) | [简体中文](../zh-CN/incapsula.md) | [日本語](../ja/incapsula.md) | [Português (Brasil)](../pt-BR/incapsula.md) | **Deutsch** | [Français](../fr/incapsula.md) | [한국어](../ko/incapsula.md)

# Incapsula (Imperva) Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Incapsula (Imperva) ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Incapsula (Imperva) umgehen möchten, Incapsula (Imperva) auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Incapsula (Imperva) blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Incapsula (Imperva) Ihre Anfragen beantwortet. Diese Seite listet die 10 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Incapsula (Imperva) identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Incapsula ist der frühere Name der Cloud-Web-Application-Firewall und des CDN von Imperva. Es verbindet WAF-Regeln mit Bot-Schutz und ist häufig an seinen Cookies zu erkennen.

Offizielle Website: [https://www.imperva.com/products/web-application-firewall-waf/](https://www.imperva.com/products/web-application-firewall-waf/)

## Woran erkenne ich, ob eine Website Incapsula (Imperva) nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-incapsula` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^incap_ses_[0-9]+_[0-9]+$` | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) |
| `^visid_incap_[0-9]+$` | 100% | Incapsula visitor ID cookie (visid_incap_<site>) |
| `^nlbi_[0-9]+(?:_[0-9]+)?$` | 60% | Incapsula load balancer cookie (nlbi_<site>) |
| `^reese84$` | 100% | Imperva Advanced Bot Protection token cookie |
| `^___utmvc$` | 100% | Incapsula JavaScript challenge cookie (___utmvc) |
| `^_impv_routing$` | 40% (nur zur Bestätigung) | Imperva edge routing cookie (seen with incap_ses_ / visid_incap_) |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-iinfo$` | 100% | Incapsula request info response header |
| `^x-cdn$: ^(?:Imperva\|Incapsula)$` | 100% | Imperva CDN response header |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/_Incapsula_Resource\?` | 100% | Incapsula challenge resource endpoint |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_Incapsula_Resource` | 20% | Script reference to _Incapsula_Resource or the incident page |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Incapsula session and visitor cookies | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) und (Incapsula visitor ID cookie (visid_incap_<site>) oder Incapsula load balancer cookie (nlbi_<site>) oder Imperva edge routing cookie (seen with incap_ses_ / visid_incap_)) |
| Imperva edge header with an Incapsula cookie | 100% | (Incapsula request info response header oder Imperva CDN response header) und (Incapsula session cookie (incap_ses_<proxy>_<site>) oder Incapsula visitor ID cookie (visid_incap_<site>) oder Incapsula load balancer cookie (nlbi_<site>) oder Imperva Advanced Bot Protection token cookie) |
| Incapsula challenge resource with a challenge cookie | 90% | Incapsula challenge resource endpoint und (Incapsula JavaScript challenge cookie (___utmvc) oder Imperva Advanced Bot Protection token cookie oder Incapsula session cookie (incap_ses_<proxy>_<site>)) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Incapsula (Imperva) im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Incapsula (Imperva) geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Incapsula (Imperva) mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
