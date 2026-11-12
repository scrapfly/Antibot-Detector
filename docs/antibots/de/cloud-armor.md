[English](../cloud-armor.md) | [Español](../es/cloud-armor.md) | [Русский](../ru/cloud-armor.md) | [简体中文](../zh-CN/cloud-armor.md) | [日本語](../ja/cloud-armor.md) | [Português (Brasil)](../pt-BR/cloud-armor.md) | **Deutsch** | [Français](../fr/cloud-armor.md) | [한국어](../ko/cloud-armor.md)

# Google Cloud Armor Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Google Cloud Armor ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Google Cloud Armor umgehen möchten, Google Cloud Armor auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Google Cloud Armor blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Google Cloud Armor Ihre Anfragen beantwortet. Diese Seite listet die 3 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Google Cloud Armor identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Google Cloud Armor ist der WAF- und DDoS-Schutzdienst vor den Load Balancern von Google Cloud. Sein Bot-Management nutzt reCAPTCHA, um Besucher zu prüfen und die Tokens zu kontrollieren, die reCAPTCHA in ihrem Browser hinterlässt.

Offizielle Website: [https://cloud.google.com/security/products/armor](https://cloud.google.com/security/products/armor)

## Woran erkenne ich, ob eine Website Google Cloud Armor nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-cloud-armor` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^recaptcha-ca-e$` | 90% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) |
| `^recaptcha-ca-t$` | 70% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://www\.(?:google\.com\|recaptcha\.net)/recaptcha/(?:api\|enterprise)\.js\?(?:[^#]*&)?waf=session(?:[&#]\|$)` | 50% (nur zur Bestätigung) | reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Exemption cookie and session-token cookie | 100% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) und recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |
| Session-token cookie with the reCAPTCHA script that sets it | 85% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) und reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |
| Exemption cookie with a reCAPTCHA for WAF session-token script | 95% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) und reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Google Cloud Armor im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Google Cloud Armor geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Google Cloud Armor mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
