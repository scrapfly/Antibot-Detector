[English](../botguard.md) | [Español](../es/botguard.md) | [Русский](../ru/botguard.md) | [简体中文](../zh-CN/botguard.md) | [日本語](../ja/botguard.md) | [Português (Brasil)](../pt-BR/botguard.md) | [Deutsch](../de/botguard.md) | **Français** | [한국어](../ko/botguard.md)

# Protection anti-bot Google BotGuard : comment la détecter (et ce que cela implique pour le scraping)

Google BotGuard est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Google BotGuard, à détecter Google BotGuard sur un site ou à comprendre un web scraping bloqué par Google BotGuard, la première étape est la même : confirmer que Google BotGuard est bien ce qui répond à vos requêtes. Cette page recense les 7 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Google BotGuard, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

BotGuard est la technologie propre à Google d'intégrité côté client et de détection des bots. Elle est utilisée par les services Google et par reCAPTCHA, et Google ne publie pas son fonctionnement.

Site officiel: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## Comment savoir si un site utilise Google BotGuard

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-botguard` (version de la règle 2.3.0, dernière mise à jour 2026-10-17). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (corroboration seule) | BotGuard interpreter URL key |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `trayride (exists)` | 50% (corroboration seule) | BotGuard VM global (globalName from bgChallenge) |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) ou BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) et (Web Anti-Abuse (BotGuard) attestation RPC ou Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) ou BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) et (BotGuard challenge config key in page data ou BotGuard interpreter URL key ou BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC ou Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) et (BotGuard VM global (globalName from bgChallenge) ou BotGuard challenge config key in page data) |

## Difficulté

**Élevée.** Élevée signifie que l'extension considère cette protection comme l'une des plus difficiles à franchir : elle combine généralement des vérifications côté client avec un scoring comportemental ou côté serveur.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Google BotGuard est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Google BotGuard sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Google BotGuard avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
