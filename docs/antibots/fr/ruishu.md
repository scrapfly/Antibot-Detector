[English](../ruishu.md) | [Español](../es/ruishu.md) | [Русский](../ru/ruishu.md) | [简体中文](../zh-CN/ruishu.md) | [日本語](../ja/ruishu.md) | [Português (Brasil)](../pt-BR/ruishu.md) | [Deutsch](../de/ruishu.md) | **Français** | [한국어](../ko/ruishu.md)

# Protection anti-bot Ruishu : comment la détecter (et ce que cela implique pour le scraping)

Ruishu est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Ruishu, à détecter Ruishu sur un site ou à comprendre un web scraping bloqué par Ruishu, la première étape est la même : confirmer que Ruishu est bien ce qui répond à vos requêtes. Cette page recense les 6 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Ruishu, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Ruishu est un produit chinois de protection anti-bot de River Security. Il diffuse généralement du JavaScript fortement obfusqué qui définit des cookies dynamiques avant que la vraie page ne soit servie.

Site officiel: [https://www.riversecurity.com/](https://www.riversecurity.com/)

## Comment savoir si un site utilise Ruishu

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-ruishu` (version de la règle 2.2.0, dernière mise à jour 2026-10-16). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^FSSBBIl1UgzbN7N80[TS]$` | 100% | Ruishu static-cookie generator family (generation 4 name family) |
| `^waf_ci` | 45% (corroboration seule) | Ruishu WAF challenge-index cookie |
| `^[A-Za-z0-9]{12}[SO]$` | 30% (corroboration seule) | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page |
| `^[A-Za-z0-9]{12}[TP]$` | 30% (corroboration seule) | Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `$_ts (typeof object)` | 70% | Ruishu challenge state object defined by the obfuscated challenge script |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `script[r="m"]` | 60% | Ruishu challenge page: every script tag carries the r="m" marker attribute |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Challenge-page script marker with a Ruishu cookie | 90% | Ruishu challenge page: every script tag carries the r="m" marker attribute et (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page ou Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads ou Ruishu static-cookie generator family (generation 4 name family)) |
| Challenge state object with a Ruishu cookie | 90% | Ruishu challenge state object defined by the obfuscated challenge script et (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page ou Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads ou Ruishu static-cookie generator family (generation 4 name family)) |
| Server and client challenge cookies left after the challenge passed | 85% | Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page et Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads |
| Static-cookie family with the challenge-index cookie | 75% | Ruishu static-cookie generator family (generation 4 name family) et Ruishu WAF challenge-index cookie |
| Challenge state, script marker and a Ruishu cookie | 100% | Ruishu challenge state object defined by the obfuscated challenge script et Ruishu challenge page: every script tag carries the r="m" marker attribute et (Current-generation Ruishu server cookie: a random 13-character name ending in S (O on some deployments), set with the 412 challenge page ou Current-generation Ruishu client cookie: the same kind of name ending in T (P on some deployments), written by the challenge script before it reloads ou Ruishu static-cookie generator family (generation 4 name family)) |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Ruishu est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Ruishu sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Ruishu avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
