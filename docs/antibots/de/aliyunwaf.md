[English](../aliyunwaf.md) | [Español](../es/aliyunwaf.md) | [Русский](../ru/aliyunwaf.md) | [简体中文](../zh-CN/aliyunwaf.md) | [日本語](../ja/aliyunwaf.md) | [Português (Brasil)](../pt-BR/aliyunwaf.md) | **Deutsch** | [Français](../fr/aliyunwaf.md) | [한국어](../ko/aliyunwaf.md)

# Alibaba Cloud WAF Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Alibaba Cloud WAF ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Alibaba Cloud WAF umgehen möchten, Alibaba Cloud WAF auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Alibaba Cloud WAF blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Alibaba Cloud WAF Ihre Anfragen beantwortet. Diese Seite listet die 8 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Alibaba Cloud WAF identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Alibaba Cloud WAF ist die Web Application Firewall von Alibaba Cloud. Neben dem Filtern von Angriffen kann sie Clients, denen sie nicht vertraut, JavaScript-Challenges stellen. Deshalb sitzt sie vor vielen chinesischen und einigen internationalen Websites.

Offizielle Website: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## Woran erkenne ich, ob eine Website Alibaba Cloud WAF nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-aliyunwaf` erzeugt (Regelversion 2.1.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (nur zur Bestätigung) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (nur zur Bestätigung) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (nur zur Bestätigung) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (nur zur Bestätigung) | Trace-id line of the Alibaba Cloud WAF block page |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie und Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) und Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie und (Alibaba Cloud WAF load-balancing session cookie oder Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host und (Alibaba Cloud WAF JavaScript-challenge clearance cookie oder Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) oder Banner image of the Alibaba Cloud WAF 405 block page (English UI)) und Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie und Alibaba Cloud WAF load-balancing session cookie und Block-page help resources on the Aliyun Yundun errors host |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Alibaba Cloud WAF im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Alibaba Cloud WAF geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Alibaba Cloud WAF mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
