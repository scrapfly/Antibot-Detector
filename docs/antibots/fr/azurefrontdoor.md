[English](../azurefrontdoor.md) | [Español](../es/azurefrontdoor.md) | [Русский](../ru/azurefrontdoor.md) | [简体中文](../zh-CN/azurefrontdoor.md) | [日本語](../ja/azurefrontdoor.md) | [Português (Brasil)](../pt-BR/azurefrontdoor.md) | [Deutsch](../de/azurefrontdoor.md) | **Français** | [한국어](../ko/azurefrontdoor.md)

# Protection anti-bot Azure Front Door : comment la détecter (et ce que cela implique pour le scraping)

Azure Front Door est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Azure Front Door, à détecter Azure Front Door sur un site ou à comprendre un web scraping bloqué par Azure Front Door, la première étape est la même : confirmer que Azure Front Door est bien ce qui répond à vos requêtes. Cette page recense les 4 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Azure Front Door, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Azure Front Door est le service mondial de diffusion de contenu et d'applications de Microsoft pour Azure. Il peut être associé au pare-feu applicatif web d'Azure ; le repérer renseigne donc sur la couche edge placée devant un site, pas toujours sur un filtrage des bots.

Site officiel: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## Comment savoir si un site utilise Azure Front Door

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-azurefrontdoor` (version de la règle 2.1.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (corroboration seule) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response et Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response et Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host et (Azure Front Door request reference header on every edge response ou Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response et Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) et Resource served from an azurefd.net Front Door endpoint host |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Azure Front Door est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Azure Front Door sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Azure Front Door avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
