[English](../castle.md) | [Español](../es/castle.md) | [Русский](../ru/castle.md) | [简体中文](../zh-CN/castle.md) | [日本語](../ja/castle.md) | [Português (Brasil)](../pt-BR/castle.md) | [Deutsch](../de/castle.md) | **Français** | [한국어](../ko/castle.md)

# Protection anti-bot Castle : comment la détecter (et ce que cela implique pour le scraping)

Castle est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Castle, à détecter Castle sur un site ou à comprendre un web scraping bloqué par Castle, la première étape est la même : confirmer que Castle est bien ce qui répond à vos requêtes. Cette page recense les 6 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Castle, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Castle est un éditeur de sécurité qui propose une protection contre la prise de contrôle de comptes, les bots et les abus. Son script navigateur construit un jeton de requête que le site envoie à l'API de Castle lors des connexions et des actions sensibles.

Site officiel: [https://castle.io/](https://castle.io/)

## Comment savoir si un site utilise Castle

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-castle` (version de la règle 2.0.1, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^__cuid$` | 30% | __cuid device cookie Castle.js stores by default |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://cdn\.castle\.io/v2/castle\.js(?:[?#]\|$)` | 100% | Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) |
| `^https://m\.castle\.io/v1/monitor(?:[/?#]\|$)` | 100% | Castle.js event request to the vendor m.castle.io monitor endpoint |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `Castle.createRequestToken (typeof function)` | 60% | Castle.createRequestToken function of the Castle.js global |
| `Castle.injectTokenOnSubmit (typeof function)` | 50% (corroboration seule) | Castle.injectTokenOnSubmit form helper of the Castle.js global |
| `_castle (typeof function)` | 30% (corroboration seule) | _castle function set by the CDN castle.js |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Castle.js from its host with its cookie or global | 100% | (Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) ou Castle.js event request to the vendor m.castle.io monitor endpoint) et (__cuid device cookie Castle.js stores by default ou Castle.createRequestToken function of the Castle.js global ou _castle function set by the CDN castle.js) |
| __cuid cookie with Castle.js | 90% | __cuid device cookie Castle.js stores by default et (Castle.createRequestToken function of the Castle.js global ou Castle.injectTokenOnSubmit form helper of the Castle.js global ou _castle function set by the CDN castle.js ou Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) ou Castle.js event request to the vendor m.castle.io monitor endpoint) |
| Castle.js global with its helpers | 80% | Castle.createRequestToken function of the Castle.js global et Castle.injectTokenOnSubmit form helper of the Castle.js global |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Castle est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Castle sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Castle avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
