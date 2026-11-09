[English](../jiasule.md) | [Español](../es/jiasule.md) | [Русский](../ru/jiasule.md) | [简体中文](../zh-CN/jiasule.md) | [日本語](../ja/jiasule.md) | [Português (Brasil)](../pt-BR/jiasule.md) | [Deutsch](../de/jiasule.md) | **Français** | [한국어](../ko/jiasule.md)

# Protection anti-bot Jiasule (Chuangyu Shield) : comment la détecter (et ce que cela implique pour le scraping)

Jiasule (Chuangyu Shield) est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Jiasule (Chuangyu Shield), à détecter Jiasule (Chuangyu Shield) sur un site ou à comprendre un web scraping bloqué par Jiasule (Chuangyu Shield), la première étape est la même : confirmer que Jiasule (Chuangyu Shield) est bien ce qui répond à vos requêtes. Cette page recense les 7 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Jiasule (Chuangyu Shield), le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Jiasule, aussi écrit Chuangyu Shield, est un service de protection anti-DDoS et web de Knownsec, en Chine. Il présente souvent une barrière JavaScript avant le chargement d'une page.

Site officiel: [https://www.jiasule.com/](https://www.jiasule.com/)

## Comment savoir si un site utilise Jiasule (Chuangyu Shield)

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-jiasule` (version de la règle 2.2.0, dernière mise à jour 2026-10-16). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (corroboration seule) | Jiasule tracking cookie set alongside the challenge cookies |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie et Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response ou Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) et (Jiasule visitor id cookie set on first request ou Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response et Jiasule visitor id cookie set on first request et Jiasule JavaScript-challenge clearance cookie |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Jiasule (Chuangyu Shield) est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Jiasule (Chuangyu Shield) sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Jiasule (Chuangyu Shield) avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
