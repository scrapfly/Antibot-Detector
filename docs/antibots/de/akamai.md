[English](../akamai.md) | [Español](../es/akamai.md) | [Русский](../ru/akamai.md) | [简体中文](../zh-CN/akamai.md) | [日本語](../ja/akamai.md) | [Português (Brasil)](../pt-BR/akamai.md) | **Deutsch** | [Français](../fr/akamai.md) | [한국어](../ko/akamai.md)

# Akamai Bot Manager Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

Akamai Bot Manager ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie Akamai Bot Manager umgehen möchten, Akamai Bot Manager auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von Akamai Bot Manager blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich Akamai Bot Manager Ihre Anfragen beantwortet. Diese Seite listet die 19 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von Akamai Bot Manager identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Akamai Bot Manager ist das Bot-Management-Produkt von Akamai Technologies, einem CDN- und Sicherheitsunternehmen. Es wird großen Websites als Teil der Edge-Plattform von Akamai angeboten und soll Menschen, nützliche Bots und missbräuchliche Automatisierung voneinander unterscheiden.

Offizielle Website: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## Woran erkenne ich, ob eine Website Akamai Bot Manager nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-akamai` erzeugt (Regelversion 2.2.0, zuletzt aktualisiert am 2026-10-26). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Cookies

Cookie-Namen (und Werte, sofern einer geprüft wird), die auf der Seite gesetzt werden. Muster sind reguläre Ausdrücke, sofern es sich nicht um einfache Wörter handelt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|sv\|s\|so\|lso)$` | 30% (nur zur Bestätigung) | Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (nur zur Bestätigung) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### Antwort-Header

HTTP-Antwort-Header, die die Seite oder ihre Anfragen zurückliefern.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (nur zur Bestätigung) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (nur zur Bestätigung) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### Seiten- und Skriptinhalt

Text, der in der Seite oder ihren Skripten gefunden wird.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### JavaScript-Globals (window)

Eigenschaften, die der JavaScript-Kontext der Seite selbst auf `window` bereitstellt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### Anfrage- und Antwortdaten

Daten, die die Seite an eine passende Adresse sendet oder von ihr empfängt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape und (Bot Manager session cookie (hash~token) oder Bot Manager edge session cookie oder Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ oder Bot Manager sensor object (bmak) oder Bot Manager sensor_data POST body) und (Bot Manager sensor cookie in its documented hash~state~token shape oder Bot Manager session cookie (hash~token) oder Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script und Bot Manager sensor cookie in its documented hash~state~token shape und (Akamai edge server header; CDN delivery, not Bot Manager on its own oder Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own oder Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint oder SBSD challenge POST to the sbsd endpoint) und SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own oder Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) und (Bot Manager sensor cookie in its documented hash~state~token shape oder Bot Manager session cookie (hash~token) oder Bot Manager edge session cookie) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie und Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ und (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) oder Bot Manager sensor cookie in its documented hash~state~token shape oder Bot Manager session cookie (hash~token)) |

## Schwierigkeit

**Niedrig.** Niedrig bedeutet, dass die Erweiterung diesen Schutz als geringes Hindernis einstuft: Er filtert meist nur einfache Clients, und ein echter Browser oder eine korrekt aufgebaute, browserähnliche Anfrage kommt oft durch.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn Akamai Bot Manager im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch Akamai Bot Manager geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet Akamai Bot Manager mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
