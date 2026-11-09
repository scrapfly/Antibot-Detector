[English](../aliyunwaf.md) | [Español](../es/aliyunwaf.md) | [Русский](../ru/aliyunwaf.md) | [简体中文](../zh-CN/aliyunwaf.md) | [日本語](../ja/aliyunwaf.md) | [Português (Brasil)](../pt-BR/aliyunwaf.md) | [Deutsch](../de/aliyunwaf.md) | **Français** | [한국어](../ko/aliyunwaf.md)

# Protection anti-bot Alibaba Cloud WAF : comment la détecter (et ce que cela implique pour le scraping)

Alibaba Cloud WAF est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Alibaba Cloud WAF, à détecter Alibaba Cloud WAF sur un site ou à comprendre un web scraping bloqué par Alibaba Cloud WAF, la première étape est la même : confirmer que Alibaba Cloud WAF est bien ce qui répond à vos requêtes. Cette page recense les 8 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Alibaba Cloud WAF, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Alibaba Cloud WAF est le pare-feu applicatif web d'Alibaba Cloud. En plus de filtrer les attaques, il peut proposer des défis JavaScript aux clients auxquels il ne fait pas confiance, ce qui explique sa présence devant de nombreux sites chinois et certains sites internationaux.

Site officiel: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## Comment savoir si un site utilise Alibaba Cloud WAF

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-aliyunwaf` (version de la règle 2.1.0, dernière mise à jour 2026-10-16). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (corroboration seule) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (corroboration seule) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (corroboration seule) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (corroboration seule) | Trace-id line of the Alibaba Cloud WAF block page |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie et Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) et Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie et (Alibaba Cloud WAF load-balancing session cookie ou Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host et (Alibaba Cloud WAF JavaScript-challenge clearance cookie ou Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) ou Banner image of the Alibaba Cloud WAF 405 block page (English UI)) et Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie et Alibaba Cloud WAF load-balancing session cookie et Block-page help resources on the Aliyun Yundun errors host |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Alibaba Cloud WAF est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Alibaba Cloud WAF sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Alibaba Cloud WAF avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
