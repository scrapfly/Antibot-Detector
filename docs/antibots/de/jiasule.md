[English](../jiasule.md) | [Español](../es/jiasule.md) | [Русский](../ru/jiasule.md) | [简体中文](../zh-CN/jiasule.md) | [日本語](../ja/jiasule.md) | [Português (Brasil)](../pt-BR/jiasule.md) | **Deutsch** | [Français](../fr/jiasule.md) | [한국어](../ko/jiasule.md)

# Jiasule (Chuangyu Shield) Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Jiasule (Chuangyu Shield) ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Jiasule (Chuangyu Shield) umgehen möchten, Jiasule (Chuangyu Shield) auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Jiasule (Chuangyu Shield) blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Jiasule (Chuangyu Shield) Ihre Anfragen beantwortet. Diese Seite listet die 7 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Jiasule (Chuangyu Shield) identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Jiasule, auch Chuangyu Shield geschrieben, ist ein Anti-DDoS- und Web-Schutzdienst von Knownsec in China. Häufig stellt er vor dem Laden einer Seite ein JavaScript-Gate vor.

Offizielle Website: [https://www.jiasule.com/](https://www.jiasule.com/)

## Woran erkenne ich, ob eine Website Jiasule (Chuangyu Shield) nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-jiasule` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (nur zur Bestätigung) | Jiasule tracking cookie set alongside the challenge cookies |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie und Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response oder Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) und (Jiasule visitor id cookie set on first request oder Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response und Jiasule visitor id cookie set on first request und Jiasule JavaScript-challenge clearance cookie |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Jiasule (Chuangyu Shield) im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Jiasule (Chuangyu Shield) geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Jiasule (Chuangyu Shield) mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
