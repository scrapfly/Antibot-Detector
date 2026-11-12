[English](../datadome.md) | [Español](../es/datadome.md) | [Русский](../ru/datadome.md) | [简体中文](../zh-CN/datadome.md) | [日本語](../ja/datadome.md) | [Português (Brasil)](../pt-BR/datadome.md) | [Deutsch](../de/datadome.md) | **Français** | [한국어](../ko/datadome.md)

# Protection anti-bot DataDome : comment la détecter (et ce que cela implique pour le scraping)

DataDome est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner DataDome, à détecter DataDome sur un site ou à comprendre un web scraping bloqué par DataDome, la première étape est la même : confirmer que DataDome est bien ce qui répond à vos requêtes. Cette page recense les 13 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots DataDome, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

DataDome est un éditeur français de protection contre les bots et la fraude en ligne. Il évalue les requêtes avec une balise JavaScript et des signaux côté serveur, et peut répondre par un défi ou une page de blocage.

Site officiel: [https://datadome.co/](https://datadome.co/)

## Comment savoir si un site utilise DataDome

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-datadome` (version de la règle 2.2.0, dernière mise à jour 2026-11-12). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (corroboration seule) | DataDome block-type header on challenge responses |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:[a-z0-9-]+\.)+captcha-delivery\.com(?:[/?#:]\|$)` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (corroboration seule) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (corroboration seule) | DataDome block page bootstrap (var dd={'rt':...}) |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |
| `ddoptions (typeof object)` | 60% | DataDome tag options object (window.ddoptions) |
| `displayDataDomeResponsePage (typeof function)` | 85% | DataDome response page function (window.displayDataDomeResponsePage) |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint ou DataDome JS key set by the integration snippet ou Integration snippet setting window.ddjskey) et DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header ou DataDome protection response header ou Response served by DataDome itself (block or challenge page)) et DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only et (DataDome JS key set by the integration snippet ou Integration snippet setting window.ddjskey ou DataDome tag options object (window.ddoptions)) |
| DataDome block page | 95% | (DataDome block page bootstrap (var dd={'rt':...}) ou DataDome response page function (window.displayDataDomeResponsePage)) et (DataDome client ID response header ou DataDome block-type header on challenge responses ou DataDome challenge or CAPTCHA delivery host ou DataDome session cookie) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si DataDome est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par DataDome sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche DataDome avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
