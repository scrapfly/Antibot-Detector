[English](../cloudflare-waitingroom.md) | [Español](../es/cloudflare-waitingroom.md) | [Русский](../ru/cloudflare-waitingroom.md) | [简体中文](../zh-CN/cloudflare-waitingroom.md) | [日本語](../ja/cloudflare-waitingroom.md) | [Português (Brasil)](../pt-BR/cloudflare-waitingroom.md) | [Deutsch](../de/cloudflare-waitingroom.md) | **Français** | [한국어](../ko/cloudflare-waitingroom.md)

# Protection anti-bot Cloudflare Waiting Room : comment la détecter (et ce que cela implique pour le scraping)

Cloudflare Waiting Room est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Cloudflare Waiting Room, à détecter Cloudflare Waiting Room sur un site ou à comprendre un web scraping bloqué par Cloudflare Waiting Room, la première étape est la même : confirmer que Cloudflare Waiting Room est bien ce qui répond à vos requêtes. Cette page recense les 3 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Cloudflare Waiting Room, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Cloudflare Waiting Room est une fonctionnalité de Cloudflare qui place les visiteurs dans une file d'attente lorsqu'un site s'attend à plus de trafic que son serveur d'origine ne peut en absorber. C'est un outil de régulation du trafic, pas un détecteur de bots, mais la page de file d'attente arrête tout de même les scrapers simples.

Site officiel: [https://developers.cloudflare.com/waiting-room/](https://developers.cloudflare.com/waiting-room/)

## Comment savoir si un site utilise Cloudflare Waiting Room

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-cloudflare-waitingroom` (version de la règle 2.1.0, dernière mise à jour 2026-10-16). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^__cfwaitingroom$` | 100% | Waiting Room cookie that keeps the visitor's place in the queue |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^server$: ^cloudflare$` | 15% (corroboration seule) | Served through Cloudflare; CDN delivery, not a queue on its own |
| `^cf-ray$: ^[0-9a-f]{12,20}-[A-Z]{3,4}$` | 15% (corroboration seule) | Cloudflare request id header; present on any Cloudflare response |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Queue cookie on a Cloudflare response | 85% | Waiting Room cookie that keeps the visitor's place in the queue et Served through Cloudflare; CDN delivery, not a queue on its own |
| Queue cookie with a Cloudflare request id | 80% | Waiting Room cookie that keeps the visitor's place in the queue et Cloudflare request id header; present on any Cloudflare response |
| Queue cookie with Cloudflare server and request id | 100% | Waiting Room cookie that keeps the visitor's place in the queue et Served through Cloudflare; CDN delivery, not a queue on its own et Cloudflare request id header; present on any Cloudflare response |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Cloudflare Waiting Room est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Cloudflare Waiting Room sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Cloudflare Waiting Room avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
