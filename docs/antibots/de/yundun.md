[English](../yundun.md) | [Español](../es/yundun.md) | [Русский](../ru/yundun.md) | [简体中文](../zh-CN/yundun.md) | [日本語](../ja/yundun.md) | [Português (Brasil)](../pt-BR/yundun.md) | **Deutsch** | [Français](../fr/yundun.md) | [한국어](../ko/yundun.md)

# Yundun Cloud WAF Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Yundun Cloud WAF ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Yundun Cloud WAF umgehen möchten, Yundun Cloud WAF auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Yundun Cloud WAF blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Yundun Cloud WAF Ihre Anfragen beantwortet. Diese Seite listet die 11 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Yundun Cloud WAF identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Yundun ist ein chinesischer Cloud-Sicherheitsanbieter mit einer Cloud-WAF und einem Anti-DDoS-Dienst. Seine Prüfungen sind häufig auf chinesischen Websites zu sehen.

Offizielle Website: [https://www.yundun.com/](https://www.yundun.com/)

## Woran erkenne ich, ob eine Website Yundun Cloud WAF nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-yundun` erzeugt (Regelversion 2.0.2, zuletzt aktualisiert am 2026-10-29). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (nur zur Bestätigung) | Yundun WAF session cookie |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (nur zur Bestätigung) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (nur zur Bestätigung) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (nur zur Bestätigung) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges) und Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie und (Server header carrying the Yundun edge signature (legacy edges) oder Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges) und Cache header carrying the Yundun edge signature (legacy edges) und Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge und X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) und Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) oder First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)) und (Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) oder Yundun WAF captcha marker cookie oder Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) und Yundun WAF captcha marker cookie und Server: WAF sent by the current Yundun edge |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Yundun Cloud WAF im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Yundun Cloud WAF geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Yundun Cloud WAF mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
