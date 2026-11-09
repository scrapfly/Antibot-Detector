[English](../amazon.md) | [Español](../es/amazon.md) | [Русский](../ru/amazon.md) | [简体中文](../zh-CN/amazon.md) | [日本語](../ja/amazon.md) | [Português (Brasil)](../pt-BR/amazon.md) | [Deutsch](../de/amazon.md) | **Français** | [한국어](../ko/amazon.md)

# Protection anti-bot Amazon Bot Protection : comment la détecter (et ce que cela implique pour le scraping)

Amazon Bot Protection est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Amazon Bot Protection, à détecter Amazon Bot Protection sur un site ou à comprendre un web scraping bloqué par Amazon Bot Protection, la première étape est la même : confirmer que Amazon Bot Protection est bien ce qui répond à vos requêtes. Cette page recense les 3 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Amazon Bot Protection, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Les pages de connexion d'Amazon collectent une empreinte de navigateur côté client que le formulaire de connexion soumet avec les identifiants. Elle fait partie des outils anti-abus propres à Amazon et non d'un produit que d'autres sites peuvent acheter.

Site officiel: [https://www.amazon.com/](https://www.amazon.com/)

## Comment savoir si un site utilise Amazon Bot Protection

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-amazon` (version de la règle 2.1.1, dernière mise à jour 2026-11-04). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `fwcimCmd` | 30% (corroboration seule) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (corroboration seule) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint et FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint et Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages et Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## Difficulté

**Élevée.** Élevée signifie que l'extension considère cette protection comme l'une des plus difficiles à franchir : elle combine généralement des vérifications côté client avec un scoring comportemental ou côté serveur.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Amazon Bot Protection est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Amazon Bot Protection sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Amazon Bot Protection avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
