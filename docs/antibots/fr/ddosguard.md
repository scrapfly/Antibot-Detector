[English](../ddosguard.md) | [Español](../es/ddosguard.md) | [Русский](../ru/ddosguard.md) | [简体中文](../zh-CN/ddosguard.md) | [日本語](../ja/ddosguard.md) | [Português (Brasil)](../pt-BR/ddosguard.md) | [Deutsch](../de/ddosguard.md) | **Français** | [한국어](../ko/ddosguard.md)

# Protection anti-bot DDoS-Guard : comment la détecter (et ce que cela implique pour le scraping)

DDoS-Guard est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner DDoS-Guard, à détecter DDoS-Guard sur un site ou à comprendre un web scraping bloqué par DDoS-Guard, la première étape est la même : confirmer que DDoS-Guard est bien ce qui répond à vos requêtes. Cette page recense les 4 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots DDoS-Guard, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

DDoS-Guard est un fournisseur d'hébergement et de protection DDoS qui fonctionne comme un reverse proxy. Il peut afficher une vérification du navigateur aux visiteurs qu'il souhaite contrôler.

Site officiel: [https://ddos-guard.net/](https://ddos-guard.net/)

## Comment savoir si un site utilise DDoS-Guard

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-ddosguard` (version de la règle 2.0.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^__ddg(?:[0-9]{1,2}\|id\|mark)_$` | 100% | DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^server$: ^ddos-guard$` | 100% | DDoS-Guard server header |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/ddos-guard/(?:check\|js-challenge/\|id/)` | 100% | DDoS-Guard check scripts under /.well-known/ddos-guard/ |
| `^https?://check\.ddos-guard\.net/` | 100% | Request to check.ddos-guard.net |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| DDoS-Guard server with its cookies | 100% | DDoS-Guard server header et DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |
| Browser check script on a DDoS-Guard response | 100% | (DDoS-Guard check scripts under /.well-known/ddos-guard/ ou Request to check.ddos-guard.net) et (DDoS-Guard server header ou DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies)) |
| Check scripts on the site and on check.ddos-guard.net | 95% | DDoS-Guard check scripts under /.well-known/ddos-guard/ et Request to check.ddos-guard.net |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si DDoS-Guard est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par DDoS-Guard sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche DDoS-Guard avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
