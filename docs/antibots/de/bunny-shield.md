[English](../bunny-shield.md) | [Español](../es/bunny-shield.md) | [Русский](../ru/bunny-shield.md) | [简体中文](../zh-CN/bunny-shield.md) | [日本語](../ja/bunny-shield.md) | [Português (Brasil)](../pt-BR/bunny-shield.md) | **Deutsch** | [Français](../fr/bunny-shield.md) | [한국어](../ko/bunny-shield.md)

# Bunny Shield Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Bunny Shield ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Bunny Shield umgehen möchten, Bunny Shield auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Bunny Shield blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Bunny Shield Ihre Anfragen beantwortet. Diese Seite listet die 5 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Bunny Shield identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Bunny Shield ist das Edge-Sicherheitsprodukt von bunny.net, einem CDN-Anbieter. Es ergänzt Websites auf bunny.net um eine Web Application Firewall, Ratenbegrenzung und Bot-Erkennung und kann Browser eine JavaScript-Proof-of-Work-Challenge lösen lassen.

Offizielle Website: [https://bunny.net/shield/](https://bunny.net/shield/)

## Woran erkenne ich, ob eine Website Bunny Shield nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-bunny-shield` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^bunny_shield$` | 90% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) |
| `^bunny_shield_chk$` | 90% | bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| `^bunny_shield_id$` | 90% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) |
| `^bunny_shield_bd$` | 90% | bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^server$: ^BunnyCDN-[A-Z0-9]{2,6}-[0-9]{1,8}$` | 40% (nur zur Bestätigung) | Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Proof-of-work cookie with its checksum | 100% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) und bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| Bot detection identifier and fingerprint cookies | 95% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) und bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |
| Bunny Shield cookie on a bunny.net edge response | 95% | (bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) oder bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) oder bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) oder bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs)) und Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Bunny Shield im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Bunny Shield geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Bunny Shield mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
