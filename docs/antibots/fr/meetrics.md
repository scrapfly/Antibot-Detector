[English](../meetrics.md) | [Español](../es/meetrics.md) | [Русский](../ru/meetrics.md) | [简体中文](../zh-CN/meetrics.md) | [日本語](../ja/meetrics.md) | [Português (Brasil)](../pt-BR/meetrics.md) | [Deutsch](../de/meetrics.md) | **Français** | [한국어](../ko/meetrics.md)

# Protection anti-bot Meetrics Check : comment la détecter (et ce que cela implique pour le scraping)

Meetrics Check est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Meetrics Check, à détecter Meetrics Check sur un site ou à comprendre un web scraping bloqué par Meetrics Check, la première étape est la même : confirmer que Meetrics Check est bien ce qui répond à vos requêtes. Cette page recense les 4 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Meetrics Check, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Meetrics est une société de mesure média qui a proposé des balises de mesure de la visibilité publicitaire et de la fraude publicitaire. Le détecteur signale les anciennes intégrations qui référencent encore son script, lequel peut ne plus fonctionner.

Site officiel: [https://www.meetrics.com/en/](https://www.meetrics.com/en/)

## Comment savoir si un site utilise Meetrics Check

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-meetrics` (version de la règle 2.1.0, dernière mise à jour 2026-10-17). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}mxcdn\.net/bb-mx/serve/mtrcs_[0-9]+\.js(?:[?#]\|$)` | 40% | Legacy Meetrics tag (mxcdn.net, now parked) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}meetrics\.(?:com\|net)/` | 20% (corroboration seule) | Legacy meetrics.com/.net host |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `meetricsGlobal` | 5% | Meetrics global reference in scripts |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `meetricsGlobal (typeof object)` | 40% | Meetrics global object |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Legacy tag with its runtime | 60% | Legacy Meetrics tag (mxcdn.net, now parked) et Meetrics global object |
| Meetrics host traffic with its runtime | 50% | Legacy meetrics.com/.net host et (Meetrics global object ou Meetrics global reference in scripts) |
| Legacy tag referenced in page scripts | 45% | Legacy Meetrics tag (mxcdn.net, now parked) et Meetrics global reference in scripts |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Meetrics Check est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Meetrics Check sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Meetrics Check avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
