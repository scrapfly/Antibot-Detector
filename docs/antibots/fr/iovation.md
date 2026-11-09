[English](../iovation.md) | [Español](../es/iovation.md) | [Русский](../ru/iovation.md) | [简体中文](../zh-CN/iovation.md) | [日本語](../ja/iovation.md) | [Português (Brasil)](../pt-BR/iovation.md) | [Deutsch](../de/iovation.md) | **Français** | [한국어](../ko/iovation.md)

# Protection anti-bot iovation (TransUnion TruValidate) : comment la détecter (et ce que cela implique pour le scraping)

iovation (TransUnion TruValidate) est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner iovation (TransUnion TruValidate), à détecter iovation (TransUnion TruValidate) sur un site ou à comprendre un web scraping bloqué par iovation (TransUnion TruValidate), la première étape est la même : confirmer que iovation (TransUnion TruValidate) est bien ce qui répond à vos requêtes. Cette page recense les 9 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots iovation (TransUnion TruValidate), le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

iovation est un service de reconnaissance d'appareils et de prévention de la fraude qui fait désormais partie de TransUnion sous le nom TruValidate. Son script collecte une blackbox d'appareil que le site soumet lors des actions sensibles.

Site officiel: [https://www.iovation.com/](https://www.iovation.com/)

## Comment savoir si un site utilise iovation (TransUnion TruValidate)

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-iovation` (version de la règle 2.0.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (corroboration seule) | iovation logo.js served through the site's own /iojs/ proxy |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (corroboration seule) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (corroboration seule) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (corroboration seule) | io_global_object_name setting read by the iovation scripts |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (corroboration seule) | Hidden ioBlackBox field that receives the iovation blackbox |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) ou iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) et (IGLOO.getBlackbox function of the iovation loader ou IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy ou iovation logo.js served through the site's own /iojs/ proxy) et (IGLOO.getBlackbox function of the iovation loader ou IGLOO.fp object created by the iovation profiling scripts ou io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader ou IGLOO.fp object created by the iovation profiling scripts) et (io_global_object_name setting read by the iovation scripts ou iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) ou Hidden ioBlackBox field that receives the iovation blackbox) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si iovation (TransUnion TruValidate) est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par iovation (TransUnion TruValidate) sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche iovation (TransUnion TruValidate) avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
