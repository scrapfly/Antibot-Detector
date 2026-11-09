[English](../amazon.md) | [Español](../es/amazon.md) | [Русский](../ru/amazon.md) | [简体中文](../zh-CN/amazon.md) | [日本語](../ja/amazon.md) | [Português (Brasil)](../pt-BR/amazon.md) | **Deutsch** | [Français](../fr/amazon.md) | [한국어](../ko/amazon.md)

# Amazon Bot Protection Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Amazon Bot Protection ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Amazon Bot Protection umgehen möchten, Amazon Bot Protection auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Amazon Bot Protection blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Amazon Bot Protection Ihre Anfragen beantwortet. Diese Seite listet die 3 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Amazon Bot Protection identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Die Anmeldeseiten von Amazon erfassen einen clientseitigen Browser-Fingerprint, den das Anmeldeformular zusammen mit den Zugangsdaten übermittelt. Er gehört zu Amazons eigenen Anti-Abuse-Werkzeugen und ist kein Produkt, das andere Websites kaufen können.

Offizielle Website: [https://www.amazon.com/](https://www.amazon.com/)

## Woran erkenne ich, ob eine Website Amazon Bot Protection nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-amazon` erzeugt (Regelversion 2.1.1, zuletzt aktualisiert am 2026-11-04). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `fwcimCmd` | 30% (nur zur Bestätigung) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### DOM-Elemente

Elemente, die per CSS-Selektor gefunden werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (nur zur Bestätigung) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint und FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint und Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages und Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## Schwierigkeit

**Hoch.** Hoch bedeutet, dass die Erweiterung diesen Schutz zu den am schwersten zu überwindenden zählt: Er kombiniert in der Regel clientseitige Prüfungen mit verhaltensbasierter oder serverseitiger Bewertung.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Amazon Bot Protection im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Amazon Bot Protection geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Amazon Bot Protection mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
