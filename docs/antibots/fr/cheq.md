[English](../cheq.md) | [Español](../es/cheq.md) | [Русский](../ru/cheq.md) | [简体中文](../zh-CN/cheq.md) | [日本語](../ja/cheq.md) | [Português (Brasil)](../pt-BR/cheq.md) | [Deutsch](../de/cheq.md) | **Français** | [한국어](../ko/cheq.md)

# Protection anti-bot Cheq : comment la détecter (et ce que cela implique pour le scraping)

Cheq est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Cheq, à détecter Cheq sur un site ou à comprendre un web scraping bloqué par Cheq, la première étape est la même : confirmer que Cheq est bien ce qui répond à vos requêtes. Cette page recense les 12 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Cheq, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

CHEQ est une entreprise de sécurité go-to-market qui vend des solutions de prévention des bots, du trafic invalide et de la fraude, principalement pour le trafic publicitaire et marketing.

Site officiel: [https://cheq.ai/](https://cheq.ai/)

## Comment savoir si un site utilise Cheq

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-cheq` (version de la règle 2.2.0, dernière mise à jour 2026-10-17). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (corroboration seule) | Other CHEQ cookies |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (corroboration seule) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (corroboration seule) | CHEQ queue object (_cq) |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class ou CHEQ tag with its JSONP callback attribute ou CHEQ ClickTrue host (cheqzone.com)) et (CHEQ SDK global ou CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie ou Other CHEQ cookies) et (CHEQ queue object (_cq) ou CHEQ JSONP callback name ou CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host et (CHEQ visitor/session id cookie ou Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai) et (CHEQ SDK global ou CHEQ queue object (_cq) ou CHEQ visitor/session id cookie ou Other CHEQ cookies)) ou ((ClickTrue tag; served from a disguised random host, identified by its class ou CHEQ tag with its JSONP callback attribute ou CHEQ ClickTrue host (cheqzone.com)) et (CHEQ queue object (_cq) ou Other CHEQ cookies)) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Cheq est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Cheq sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Cheq avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
