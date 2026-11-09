[English](../queueit.md) | [Español](../es/queueit.md) | [Русский](../ru/queueit.md) | [简体中文](../zh-CN/queueit.md) | [日本語](../ja/queueit.md) | [Português (Brasil)](../pt-BR/queueit.md) | [Deutsch](../de/queueit.md) | **Français** | [한국어](../ko/queueit.md)

# Protection anti-bot Queue-it : comment la détecter (et ce que cela implique pour le scraping)

Queue-it est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Queue-it, à détecter Queue-it sur un site ou à comprendre un web scraping bloqué par Queue-it, la première étape est la même : confirmer que Queue-it est bien ce qui répond à vos requêtes. Cette page recense les 9 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Queue-it, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Queue-it est un service de salle d'attente virtuelle. Il envoie les visiteurs vers une page de file d'attente lorsqu'un site est surchargé, par exemple lors d'une vente de billets ou de produits. Il régule le trafic plutôt que de détecter les bots, même s'il propose aussi des options de filtrage des bots.

Site officiel: [https://queue-it.com/](https://queue-it.com/)

## Comment savoir si un site utilise Queue-it

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-queueit` (version de la règle 2.0.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^QueueITAccepted-SDFrts345E-V3_` | 60% | Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue |
| `^Queue-it-visitorsession$` | 100% | Queue-it-visitorsession cookie set by the queue page |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://static\.queue-it\.net/script/(?:queueclient\|queueconfigloader)(?:\.min)?\.js(?:[?#]\|$)` | 100% | Queue-it JavaScript connector loaded from static.queue-it.net |
| `^https?://assets\.queue-it\.net/[a-z0-9_-]+/integrationconfig/javascript/queueclientConfig\.js` | 100% | Queue-it integration config requested from assets.queue-it.net |
| `^https?://assets\.queue-it\.net/static/QueueFront/` | 100% | Queue page scripts and images from assets.queue-it.net/static/QueueFront/ |
| `^https?://(?!(?:go\|static\|assets\|www)\.)[a-z0-9-]+\.queue-it\.net/` | 100% | Queue-it queue page on a customer subdomain of queue-it.net |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?queueittoken=` | 40% (corroboration seule) | queueittoken parameter in the page address after leaving the queue |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `QueueIt.Javascript (typeof object)` | 60% | QueueIt.Javascript object created by the Queue-it connector |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `script[data-queueit-c]` | 50% | Queue-it connector script tag with its data-queueit-c customer attribute |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Connector script with its runtime or tag | 100% | (Queue-it JavaScript connector loaded from static.queue-it.net ou Queue-it integration config requested from assets.queue-it.net) et (QueueIt.Javascript object created by the Queue-it connector ou Queue-it connector script tag with its data-queueit-c customer attribute) |
| Queue page with its scripts or session cookie | 100% | Queue-it queue page on a customer subdomain of queue-it.net et (Queue page scripts and images from assets.queue-it.net/static/QueueFront/ ou Queue-it-visitorsession cookie set by the queue page) |
| Back from the queue with its token or cookie | 90% | (queueittoken parameter in the page address after leaving the queue ou Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue) et (Queue-it JavaScript connector loaded from static.queue-it.net ou Queue-it integration config requested from assets.queue-it.net ou QueueIt.Javascript object created by the Queue-it connector ou Queue-it connector script tag with its data-queueit-c customer attribute) |
| Connector tag with the Queue-it runtime | 85% | Queue-it connector script tag with its data-queueit-c customer attribute et QueueIt.Javascript object created by the Queue-it connector |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Queue-it est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Queue-it sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Queue-it avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
