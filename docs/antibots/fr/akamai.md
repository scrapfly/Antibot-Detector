[English](../akamai.md) | [Español](../es/akamai.md) | [Русский](../ru/akamai.md) | [简体中文](../zh-CN/akamai.md) | [日本語](../ja/akamai.md) | [Português (Brasil)](../pt-BR/akamai.md) | [Deutsch](../de/akamai.md) | **Français** | [한국어](../ko/akamai.md)

# Protection anti-bot Akamai Bot Manager : comment la détecter (et ce que cela implique pour le scraping)

Akamai Bot Manager est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Akamai Bot Manager, à détecter Akamai Bot Manager sur un site ou à comprendre un web scraping bloqué par Akamai Bot Manager, la première étape est la même : confirmer que Akamai Bot Manager est bien ce qui répond à vos requêtes. Cette page recense les 20 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Akamai Bot Manager, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Akamai Bot Manager est le produit de gestion des bots d'Akamai Technologies, une entreprise de CDN et de sécurité. Il est vendu aux grands sites dans le cadre de la plateforme edge d'Akamai et vise à distinguer les humains, les bots légitimes et l'automatisation abusive.

Site officiel: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## Comment savoir si un site utilise Akamai Bot Manager

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-akamai` (version de la règle 2.3.0, dernière mise à jour 2026-11-12). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|s\|so\|lso)$` | 30% (corroboration seule) | Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only |
| `^bm_sv$` | 60% | Bot Manager cookie bm_sv, named in Akamai's cookie documentation |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (corroboration seule) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (corroboration seule) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (corroboration seule) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### Charges utiles des requêtes et des réponses

Données que la page envoie à une adresse correspondante, ou qu'elle en reçoit.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape et (Bot Manager session cookie (hash~token) ou Bot Manager edge session cookie ou Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only ou Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ ou Bot Manager sensor object (bmak) ou Bot Manager sensor_data POST body) et (Bot Manager sensor cookie in its documented hash~state~token shape ou Bot Manager session cookie (hash~token) ou Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script et Bot Manager sensor cookie in its documented hash~state~token shape et (Akamai edge server header; CDN delivery, not Bot Manager on its own ou Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own ou Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint ou SBSD challenge POST to the sbsd endpoint) et SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own ou Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) et (Bot Manager sensor cookie in its documented hash~state~token shape ou Bot Manager session cookie (hash~token) ou Bot Manager edge session cookie ou Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie et (Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only ou Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ et (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) ou Bot Manager sensor cookie in its documented hash~state~token shape ou Bot Manager session cookie (hash~token)) |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Akamai Bot Manager est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Akamai Bot Manager sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Akamai Bot Manager avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
