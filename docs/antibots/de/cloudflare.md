[English](../cloudflare.md) | [Español](../es/cloudflare.md) | [Русский](../ru/cloudflare.md) | [简体中文](../zh-CN/cloudflare.md) | [日本語](../ja/cloudflare.md) | [Português (Brasil)](../pt-BR/cloudflare.md) | **Deutsch** | [Français](../fr/cloudflare.md) | [한국어](../ko/cloudflare.md)

# Cloudflare Bot Management Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Cloudflare Bot Management ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Cloudflare Bot Management umgehen möchten, Cloudflare Bot Management auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Cloudflare Bot Management blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Cloudflare Bot Management Ihre Anfragen beantwortet. Diese Seite listet die 11 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Cloudflare Bot Management identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Cloudflare Bot Management ist das kostenpflichtige Produkt von Cloudflare zur Bot-Erkennung, das über das globale Netzwerk des Unternehmens bereitgestellt wird. Cloudflare betreibt außerdem kostenlose Challenge-Seiten; eine Cloudflare-Challenge bedeutet daher nicht von sich aus, dass das kostenpflichtige Produkt aktiviert ist.

Offizielle Website: [https://www.cloudflare.com/products/bot-management/](https://www.cloudflare.com/products/bot-management/)

## Woran erkenne ich, ob eine Website Cloudflare Bot Management nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-cloudflare` erzeugt (Regelversion 2.3.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^cf_clearance$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Challenge clearance cookie, set after passing a Cloudflare challenge |
| `^__cf_bm$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}\.[0-9]{5,8}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode |
| `^cf_chl_rc_(?:i\|ni\|m)$` | 85% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^cf-mitigated$: ^challenge$` | 100% | Response header Cloudflare sends when it served a challenge page |
| `^server$: ^cloudflare$` | 15% (nur zur Bestätigung) | Served through Cloudflare; CDN delivery, not bot management on its own |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?orchestrate/(?:chl_page\|managed\|jsch\|captcha)/` | 100% | Challenge page orchestrator under /cdn-cgi/challenge-platform/ |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?scripts/jsd/(?:[0-9a-f]{6,20}/)?main\.js(?:[?#]\|$)` | 100% | Bot Management JavaScript detections script |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?jsd/oneshot/` | 100% | Bot Management JavaScript detections report (/cdn-cgi/challenge-platform/…/jsd/oneshot/) |
| `^https://challenges\.cloudflare\.com/` | 40% (nur zur Bestätigung) | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_cf_chl_opt` | 20% | Script reference to the _cf_chl_opt challenge options object |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_cf_chl_opt (typeof object)` | 85% | Challenge options object present on a Cloudflare challenge page |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Challenge page orchestrator and challenge options object | 100% | (Challenge page orchestrator under /cdn-cgi/challenge-platform/ oder Response header Cloudflare sends when it served a challenge page) und (Challenge options object present on a Cloudflare challenge page oder Script reference to the _cf_chl_opt challenge options object) |
| Clearance cookie with Bot Management cookie | 85% | Challenge clearance cookie, set after passing a Cloudflare challenge und (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode oder Served through Cloudflare; CDN delivery, not bot management on its own) |
| Bot Management script on a Cloudflare zone | 75% | Bot Management JavaScript detections script und (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode oder Served through Cloudflare; CDN delivery, not bot management on its own) |
| Challenge host request on a Cloudflare zone with a challenge signal | 90% | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only und (Challenge clearance cookie, set after passing a Cloudflare challenge oder Challenge options object present on a Cloudflare challenge page oder Challenge page orchestrator under /cdn-cgi/challenge-platform/) |
| Challenge platform cookie with a Cloudflare clearance, server header or challenge | 95% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) und (Challenge clearance cookie, set after passing a Cloudflare challenge oder Served through Cloudflare; CDN delivery, not bot management on its own oder Challenge page orchestrator under /cdn-cgi/challenge-platform/ oder Challenge options object present on a Cloudflare challenge page) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Cloudflare Bot Management im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Cloudflare Bot Management geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Cloudflare Bot Management mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
