[English](../aws-waf.md) | [Español](../es/aws-waf.md) | [Русский](../ru/aws-waf.md) | [简体中文](../zh-CN/aws-waf.md) | [日本語](../ja/aws-waf.md) | [Português (Brasil)](../pt-BR/aws-waf.md) | **Deutsch** | [Français](../fr/aws-waf.md) | [한국어](../ko/aws-waf.md)

# AWS WAF Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

AWS WAF ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie AWS WAF umgehen möchten, AWS WAF auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von AWS WAF blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich AWS WAF Ihre Anfragen beantwortet. Diese Seite listet die 14 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von AWS WAF identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

AWS WAF ist die Web Application Firewall von Amazon Web Services. Ihre Funktionen Bot Control und Challenge können verlangen, dass ein Browser eine JavaScript-Challenge ausführt und ein Token speichert, sodass ein einfacher HTTP-Client abgewiesen werden kann.

Offizielle Website: [https://aws.amazon.com/waf/](https://aws.amazon.com/waf/)

## Woran erkenne ich, ob eine Website AWS WAF nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-aws-waf` erzeugt (Regelversion 2.3.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^aws-waf-token$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9+/=_:-]{20,}` | 100% | AWS WAF token cookie set after a challenge |
| `^aws-waf-token$` | 85% | AWS WAF token cookie by name; its value format is not documented |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^x-amzn-waf-action$: ^(?:challenge\|captcha)$` | 100% | AWS WAF challenge or captcha action header |
| `^x-amzn-waf-challenge-id$` | 40% (nur zur Bestätigung) | AWS WAF challenge id header |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:challenge\|captcha\|jsapi)\.js(?:[?#]\|$)` | 100% | Integration SDK from the regional token.awswaf.com host |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:inputs\|verify\|telemetry\|voucher\|mp_verify)(?:[?#/]\|$)` | 100% | Any request to the regional token.awswaf.com host (inputs, verify, telemetry) |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.captcha\.awswaf\.com/` | 100% | AWS WAF CAPTCHA host |
| `^https://(?:[a-z0-9-]+\.)+awswaf\.com(?:[/?#:]\|$)` | 100% | Any request to an AWS WAF host (*.awswaf.com) |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `gokuProps` | 15% (nur zur Bestätigung) | Challenge page bootstrap variable (window.gokuProps) |
| `AwsWafIntegration` | 10% | Integration SDK namespace reference |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `AwsWafIntegration (typeof object)` | 75% | AWS WAF Integration SDK object |
| `gokuProps (typeof object)` | 70% | Challenge page bootstrap object (gokuProps) |
| `AwsWafCaptcha (typeof object)` | 75% | AWS WAF Integration SDK object |
| `awsWafCookieDomainList (exists)` | 30% (nur zur Bestätigung) | Token cookie domain list for the Integration SDK |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Challenge response with its bootstrap | 100% | (AWS WAF challenge or captcha action header oder AWS WAF challenge id header) und (Challenge page bootstrap object (gokuProps) oder Challenge page bootstrap variable (window.gokuProps) oder Integration SDK from the regional token.awswaf.com host) |
| Integration SDK with token traffic or cookie | 100% | (Integration SDK from the regional token.awswaf.com host oder AWS WAF Integration SDK object) und (AWS WAF token cookie set after a challenge oder Any request to the regional token.awswaf.com host (inputs, verify, telemetry) oder Token cookie domain list for the Integration SDK) |
| Token cookie with SDK reference | 90% | (AWS WAF token cookie set after a challenge oder AWS WAF token cookie by name; its value format is not documented) und (Integration SDK namespace reference oder Challenge page bootstrap variable (window.gokuProps) oder Token cookie domain list for the Integration SDK) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn AWS WAF im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch AWS WAF geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet AWS WAF mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
