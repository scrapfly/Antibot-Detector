[English](../sucuri.md) | [Español](../es/sucuri.md) | [Русский](../ru/sucuri.md) | [简体中文](../zh-CN/sucuri.md) | [日本語](../ja/sucuri.md) | [Português (Brasil)](../pt-BR/sucuri.md) | [Deutsch](../de/sucuri.md) | **Français** | [한국어](../ko/sucuri.md)

# Protection anti-bot Sucuri WAF : comment la détecter (et ce que cela implique pour le scraping)

Sucuri WAF est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Sucuri WAF, à détecter Sucuri WAF sur un site ou à comprendre un web scraping bloqué par Sucuri WAF, la première étape est la même : confirmer que Sucuri WAF est bien ce qui répond à vos requêtes. Cette page recense les 8 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Sucuri WAF, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Sucuri est une entreprise de sécurité de sites web dont le WAF cloud et le CDN se placent devant un site pour filtrer les attaques et le trafic indésirable.

Site officiel: [https://sucuri.net/](https://sucuri.net/)

## Comment savoir si un site utilise Sucuri WAF

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-sucuri` (version de la règle 2.1.0, dernière mise à jour 2026-10-16). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (corroboration seule) | Sucuri cache status header |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `Sucuri WebSite Firewall - Access Denied` | 30% (corroboration seule) | Sucuri block page title |
| `Block ID:` | 20% (corroboration seule) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title ou Block ID label on the Sucuri block page) et (Sucuri WAF node id header ou Sucuri block reason header ou Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header et (Sucuri WAF node id header ou Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable et (Sucuri CloudProxy JS-challenge cookie ou Sucuri WAF node id header ou Sucuri CloudProxy server header) |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Sucuri WAF est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Sucuri WAF sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Sucuri WAF avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
