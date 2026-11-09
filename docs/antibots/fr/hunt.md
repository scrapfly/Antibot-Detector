[English](../hunt.md) | [Español](../es/hunt.md) | [Русский](../ru/hunt.md) | [简体中文](../zh-CN/hunt.md) | [日本語](../ja/hunt.md) | [Português (Brasil)](../pt-BR/hunt.md) | [Deutsch](../de/hunt.md) | **Français** | [한국어](../ko/hunt.md)

# Protection anti-bot Hunt : comment la détecter (et ce que cela implique pour le scraping)

Hunt est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Hunt, à détecter Hunt sur un site ou à comprendre un web scraping bloqué par Hunt, la première étape est la même : confirmer que Hunt est bien ce qui répond à vos requêtes. Cette page recense les 4 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Hunt, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Hunt est un système anti-bot observé sur certaines plateformes de paris. Il collecte une empreinte de navigateur et peut enchaîner avec un captcha interactif lorsqu'il décide de bloquer.

Site officiel: [https://docs.capmonster.cloud/docs/captchas/hunt-task/](https://docs.capmonster.cloud/docs/captchas/hunt-task/)

## Comment savoir si un site utilise Hunt

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-hunt` (version de la règle 2.2.0, dernière mise à jour 2026-10-17). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/hd-api/external/apps/[0-9A-Za-z_-]+/api\.js(?:[?#]\|$)` | 60% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/assets/hdf\.js(?:[?#]\|$)` | 45% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/verify(?:[/?#]\|$)` | 50% | Hunt verify request that sends the browser check (hd-api/external/verify) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `/hd-api/external/apps/` | 15% | Script reference to the Hunt hd-api path |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Hunt loader with its fingerprint script | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host et Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| Hunt loader with a verify request | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host et Hunt verify request that sends the browser check (hd-api/external/verify) |
| Fingerprint script with a verify request | 85% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host et Hunt verify request that sends the browser check (hd-api/external/verify) |
| Hunt loader requested and referenced in page scripts | 75% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host et Script reference to the Hunt hd-api path |

## Difficulté

**Élevée.** Élevée signifie que l'extension considère cette protection comme l'une des plus difficiles à franchir : elle combine généralement des vérifications côté client avec un scoring comportemental ou côté serveur.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Hunt est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Hunt sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Hunt avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
