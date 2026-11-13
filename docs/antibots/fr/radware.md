[English](../radware.md) | [Español](../es/radware.md) | [Русский](../ru/radware.md) | [简体中文](../zh-CN/radware.md) | [日本語](../ja/radware.md) | [Português (Brasil)](../pt-BR/radware.md) | [Deutsch](../de/radware.md) | **Français** | [한국어](../ko/radware.md)

# Protection anti-bot Radware Bot Manager : comment la détecter (et ce que cela implique pour le scraping)

Radware Bot Manager est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Radware Bot Manager, à détecter Radware Bot Manager sur un site ou à comprendre un web scraping bloqué par Radware Bot Manager, la première étape est la même : confirmer que Radware Bot Manager est bien ce qui répond à vos requêtes. Cette page recense les 10 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Radware Bot Manager, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Radware Bot Manager, anciennement ShieldSquare, est le produit de gestion des bots de Radware. Radware vend aussi un WAF cloud, et le détecteur recherche les traces des deux.

Site officiel: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## Comment savoir si un site utilise Radware Bot Manager

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-radware` (version de la règle 2.3.0, dernière mise à jour 2026-11-12). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (corroboration seule) | Radware Bot Manager cookies written by its JavaScript |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `CloudWebSec[.@]radware\.com` | 20% (corroboration seule) | CloudWebSec contact address on the Radware block page |
| `Unauthorized Request Blocked` | 20% (corroboration seule) | Radware block-page message |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | CloudWebSec contact address on the Radware block page et Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header et (CloudWebSec contact address on the Radware block page ou Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header et CloudWebSec contact address on the Radware block page et Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) et First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) et First-party Radware Bot Manager script (stormcaster.js) et Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host et Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge et (Radware Bot Manager session cookies (__uzma … __uzmf) ou Radware Bot Manager cookies written by its JavaScript) |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Radware Bot Manager est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Radware Bot Manager sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Radware Bot Manager avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
