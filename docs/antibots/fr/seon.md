[English](../seon.md) | [Español](../es/seon.md) | [Русский](../ru/seon.md) | [简体中文](../zh-CN/seon.md) | [日本語](../ja/seon.md) | [Português (Brasil)](../pt-BR/seon.md) | [Deutsch](../de/seon.md) | **Français** | [한국어](../ko/seon.md)

# Protection anti-bot SEON : comment la détecter (et ce que cela implique pour le scraping)

SEON est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner SEON, à détecter SEON sur un site ou à comprendre un web scraping bloqué par SEON, la première étape est la même : confirmer que SEON est bien ce qui répond à vos requêtes. Cette page recense les 7 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots SEON, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

SEON est une entreprise de prévention de la fraude. Son agent JavaScript rassemble des signaux d'appareil et de réseau qui alimentent son scoring de risque.

Site officiel: [https://seon.io/](https://seon.io/)

## Comment savoir si un site utilise SEON

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-seon` (version de la règle 2.0.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://cdn\.(?:seondf\|dfsdk\|deviceinf\|seonintelligence)\.com/js/v\d+/agent(?:\.umd)?\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts |
| `^https://cdn\.seon\.io/js/v\d+/agent\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host |
| `^https://[0-9a-f]{16,64}\.seondnsresolve\.com/` | 100% | SEON agent network probe to a seondnsresolve.com host |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `\bseon\.(?:getSession\|getBase64Session\|config)\s*\(` | 20% (corroboration seule) | SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `seon.getSession (typeof function)` | 60% | seon.getSession function of the SEON v6 agent |
| `seon.getBase64Session (typeof function)` | 60% | seon.getBase64Session function of the SEON v5 agent |
| `webpackChunkseon_javascript_sdk (exists)` | 50% (corroboration seule) | webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| SEON agent from its host with its runtime | 100% | (SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts ou SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host ou SEON agent network probe to a seondnsresolve.com host) et (seon.getSession function of the SEON v6 agent ou seon.getBase64Session function of the SEON v5 agent ou webpackChunkseon_javascript_sdk global left by the SEON v5 agent) |
| SEON agent with its calls | 85% | (seon.getSession function of the SEON v6 agent ou seon.getBase64Session function of the SEON v5 agent ou webpackChunkseon_javascript_sdk global left by the SEON v5 agent) et SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |
| SEON v5 agent function with its runtime | 80% | seon.getBase64Session function of the SEON v5 agent et webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si SEON est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par SEON sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche SEON avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
