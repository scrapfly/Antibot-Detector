[English](../edgeone.md) | [Español](../es/edgeone.md) | [Русский](../ru/edgeone.md) | [简体中文](../zh-CN/edgeone.md) | [日本語](../ja/edgeone.md) | [Português (Brasil)](../pt-BR/edgeone.md) | **Deutsch** | [Français](../fr/edgeone.md) | [한국어](../ko/edgeone.md)

# Tencent Cloud EdgeOne Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Tencent Cloud EdgeOne ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Tencent Cloud EdgeOne umgehen möchten, Tencent Cloud EdgeOne auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Tencent Cloud EdgeOne blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Tencent Cloud EdgeOne Ihre Anfragen beantwortet. Diese Seite listet die 8 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Tencent Cloud EdgeOne identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Tencent Cloud EdgeOne ist die Edge-Beschleunigungs- und Sicherheitsplattform von Tencent Cloud. Neben der Auslieferung von Inhalten bietet sie eine WAF und ein Bot-Management, das JavaScript-Challenges ausliefern und Clients mit einem Attestierungs-SDK prüfen kann.

Offizielle Website: [https://edgeone.ai/](https://edgeone.ai/)

## Woran erkenne ich, ob eine Website Tencent Cloud EdgeOne nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-edgeone` erzeugt (Regelversion 2.0.0, zuletzt aktualisiert am 2026-11-12). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^EO-Bot-SessionId$` | 90% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) |
| `^EO-Bot-Token$` | 90% | EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| `^EO_Bot_Ssid$` | 60% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^eo-log-uuid$: ^[0-9]{10,24}$` | 40% (nur zur Bestätigung) | EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection |
| `^server$: ^TencentEdgeOne$` | 40% (nur zur Bestätigung) | Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://cdnstatic\.tencentcs\.com/edgeone/security/client-attestation/eoclientsecuritykit(?:\.min)?\.js(?:[?#]\|$)` | 100% | EdgeOne client attestation SDK eoclientsecuritykit.min.js on Tencent's CDN (EdgeOne docs) |
| `^https?://[^/?#]+/\.eo-sec-bot/` | 100% | Request to /.eo-sec-bot/ on the site, which the EdgeOne attestation SDK calls to start (EdgeOne docs) |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `EOClientSecurityKit (typeof object)` | 75% | EOClientSecurityKit object of the EdgeOne client attestation SDK |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Bot session cookie and client verification token | 100% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) und EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| Bot management cookie on an EdgeOne response | 95% | (EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) oder EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs)) und (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection oder Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| JavaScript challenge cookie on an EdgeOne response | 90% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs und (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection oder Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| Attestation SDK object on an EdgeOne response | 90% | EOClientSecurityKit object of the EdgeOne client attestation SDK und (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection oder Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Tencent Cloud EdgeOne im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Tencent Cloud EdgeOne geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Tencent Cloud EdgeOne mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
