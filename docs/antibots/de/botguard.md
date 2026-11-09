[English](../botguard.md) | [Español](../es/botguard.md) | [Русский](../ru/botguard.md) | [简体中文](../zh-CN/botguard.md) | [日本語](../ja/botguard.md) | [Português (Brasil)](../pt-BR/botguard.md) | **Deutsch** | [Français](../fr/botguard.md) | [한국어](../ko/botguard.md)

# Google BotGuard Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Google BotGuard ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Google BotGuard umgehen möchten, Google BotGuard auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Google BotGuard blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Google BotGuard Ihre Anfragen beantwortet. Diese Seite listet die 7 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Google BotGuard identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

BotGuard ist Googles eigene clientseitige Technologie zur Integritätsprüfung und Bot-Erkennung. Sie wird von Google-Diensten und von reCAPTCHA verwendet, und Google veröffentlicht nicht, wie sie funktioniert.

Offizielle Website: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## Woran erkenne ich, ob eine Website Google BotGuard nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-botguard` erzeugt (Regelversion 2.3.0, zuletzt aktualisiert am 2026-10-17). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (nur zur Bestätigung) | BotGuard interpreter URL key |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `trayride (exists)` | 50% (nur zur Bestätigung) | BotGuard VM global (globalName from bgChallenge) |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) oder BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) und (Web Anti-Abuse (BotGuard) attestation RPC oder Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) oder BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) und (BotGuard challenge config key in page data oder BotGuard interpreter URL key oder BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC oder Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) und (BotGuard VM global (globalName from bgChallenge) oder BotGuard challenge config key in page data) |

## Schwierigkeit

**Hoch.** Hoch bedeutet, dass die Erweiterung diesen Schutz zu den am schwersten zu überwindenden zählt: Er kombiniert in der Regel clientseitige Prüfungen mit verhaltensbasierter oder serverseitiger Bewertung.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Google BotGuard im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Google BotGuard geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Google BotGuard mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
