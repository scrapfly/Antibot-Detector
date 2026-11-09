[English](../ruishu.md) | [Español](../es/ruishu.md) | [Русский](../ru/ruishu.md) | [简体中文](../zh-CN/ruishu.md) | [日本語](../ja/ruishu.md) | [Português (Brasil)](../pt-BR/ruishu.md) | **Deutsch** | [Français](../fr/ruishu.md) | [한국어](../ko/ruishu.md)

# Ruishu Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Ruishu ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Ruishu umgehen möchten, Ruishu auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Ruishu blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Ruishu Ihre Anfragen beantwortet. Diese Seite listet die 6 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Ruishu identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Ruishu ist ein chinesisches Bot-Schutzprodukt von River Security. Es liefert typischerweise stark verschleiertes JavaScript aus, das dynamische Cookies setzt, bevor die eigentliche Seite ausgeliefert wird.

Offizielle Website: [https://www.riversecurity.com/](https://www.riversecurity.com/)

## Woran erkenne ich, ob eine Website Ruishu nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-ruishu` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-10-16). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^FSSBBIl1UgzbN7N80[TS]$` | 100% | Ruishu static-cookie generator family (generation 4 name family) |
| `^waf_ci` | 45% (nur zur Bestätigung) | Ruishu WAF challenge-index cookie |
| `^[A-Za-z0-9]{12}[SO]$` | 30% (nur zur Bestätigung) | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page |
| `^[A-Za-z0-9]{12}[TP]$` | 30% (nur zur Bestätigung) | Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `$_ts (typeof object)` | 70% | Ruishu challenge state object defined by the obfuscated challenge script |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `script[r="m"]` | 60% | Ruishu challenge page: every script tag carries the r="m" marker attribute |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Challenge-page script marker with a Ruishu cookie | 90% | Ruishu challenge page: every script tag carries the r="m" marker attribute und (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page oder Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads oder Ruishu static-cookie generator family (generation 4 name family)) |
| Challenge state object with a Ruishu cookie | 90% | Ruishu challenge state object defined by the obfuscated challenge script und (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page oder Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads oder Ruishu static-cookie generator family (generation 4 name family)) |
| Server and client challenge cookies left after the challenge passed | 85% | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page und Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |
| Static-cookie family with the challenge-index cookie | 75% | Ruishu static-cookie generator family (generation 4 name family) und Ruishu WAF challenge-index cookie |
| Challenge state, script marker and a Ruishu cookie | 100% | Ruishu challenge state object defined by the obfuscated challenge script und Ruishu challenge page: every script tag carries the r="m" marker attribute und (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page oder Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads oder Ruishu static-cookie generator family (generation 4 name family)) |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Ruishu im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Ruishu geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Ruishu mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
