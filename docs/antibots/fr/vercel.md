[English](../vercel.md) | [Español](../es/vercel.md) | [Русский](../ru/vercel.md) | [简体中文](../zh-CN/vercel.md) | [日本語](../ja/vercel.md) | [Português (Brasil)](../pt-BR/vercel.md) | [Deutsch](../de/vercel.md) | **Français** | [한국어](../ko/vercel.md)

# Protection anti-bot Vercel Firewall : comment la détecter (et ce que cela implique pour le scraping)

Vercel Firewall est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Vercel Firewall, à détecter Vercel Firewall sur un site ou à comprendre un web scraping bloqué par Vercel Firewall, la première étape est la même : confirmer que Vercel Firewall est bien ce qui répond à vos requêtes. Cette page recense les 9 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Vercel Firewall, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Vercel Firewall est la couche de sécurité de la plateforme d'hébergement Vercel. Elle comprend des règles configurables, une page de défi Attack Mode et une vérification BotID.

Site officiel: [https://vercel.com/docs/vercel-firewall](https://vercel.com/docs/vercel-firewall)

## Comment savoir si un site utilise Vercel Firewall

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-vercel` (version de la règle 2.0.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-vercel-mitigated$: ^challenge$` | 100% | x-vercel-mitigated: challenge, the Vercel Firewall served its challenge |
| `^x-vercel-mitigated$: ^deny$` | 100% | x-vercel-mitigated: deny, the Vercel Firewall blocked the request |
| `^x-vercel-challenge-(?:token\|solution\|version)$` | 60% | x-vercel-challenge-token header of the Vercel Security Checkpoint |
| `^server$: ^Vercel$` | 15% (corroboration seule) | Hosted on Vercel; hosting, not bot protection on its own |
| `^x-vercel-id$` | 15% (corroboration seule) | Vercel request id header; present on any Vercel response |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/vercel/security/static/challenge(?:\.v[0-9]+)?(?:\.min)?\.js(?:[?#]\|$)` | 90% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ |
| `^https?://[^/?#]+/\.well-known/vercel/security/request-challenge(?:[?#]\|$)` | 50% (corroboration seule) | Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge |
| `^https?://[^/?#]+/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/(?:a-4-a/c\|p)\.js(?:[?#]\|$)` | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3` | 30% | BotID path written in the page's scripts |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Vercel Security Checkpoint on a Vercel response | 100% | (x-vercel-mitigated: challenge, the Vercel Firewall served its challenge ou x-vercel-mitigated: deny, the Vercel Firewall blocked the request ou Vercel Security Checkpoint script under /.well-known/vercel/security/static/) et (Hosted on Vercel; hosting, not bot protection on its own ou Vercel request id header; present on any Vercel response) |
| BotID script with its path in the page's scripts | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) et BotID path written in the page's scripts |
| Checkpoint script with its answer request or token | 95% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ et (Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge ou x-vercel-challenge-token header of the Vercel Security Checkpoint) |
| Checkpoint token or answer request on a Vercel response | 85% | (x-vercel-challenge-token header of the Vercel Security Checkpoint ou Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge) et (Hosted on Vercel; hosting, not bot protection on its own ou Vercel request id header; present on any Vercel response) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Vercel Firewall est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Vercel Firewall sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Vercel Firewall avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
