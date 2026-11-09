[English](../siteground-captcha.md) | [Español](../es/siteground-captcha.md) | [Русский](../ru/siteground-captcha.md) | [简体中文](../zh-CN/siteground-captcha.md) | [日本語](../ja/siteground-captcha.md) | [Português (Brasil)](../pt-BR/siteground-captcha.md) | [Deutsch](../de/siteground-captcha.md) | **Français** | [한국어](../ko/siteground-captcha.md)

# Protection anti-bot SiteGround SG-CAPTCHA : comment la détecter (et ce que cela implique pour le scraping)

SiteGround SG-CAPTCHA est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner SiteGround SG-CAPTCHA, à détecter SiteGround SG-CAPTCHA sur un site ou à comprendre un web scraping bloqué par SiteGround SG-CAPTCHA, la première étape est la même : confirmer que SiteGround SG-CAPTCHA est bien ce qui répond à vos requêtes. Cette page recense les 3 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots SiteGround SG-CAPTCHA, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

SG-CAPTCHA est le défi anti-bot utilisé par l'hébergement SiteGround. Les visiteurs qui semblent automatisés sont redirigés vers une page de défi qu'il faut réussir avant que le site ne se charge.

Site officiel: [https://www.siteground.com/blog/new-anti-bot-ai/](https://www.siteground.com/blog/new-anti-bot-ai/)

## Comment savoir si un site utilise SiteGround SG-CAPTCHA

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-siteground-captcha` (version de la règle 2.0.0, dernière mise à jour 2026-11-05). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^sg-captcha$: ^challenge$` | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/sgcaptcha/(?:[?#]\|$)` | 100% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `\bsg(?:challenge\|submit_url)\b` | 30% | SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| sg-captcha header on the SG-CAPTCHA challenge page | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge et SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |
| sg-captcha header with the challenge constants in the page's scripts | 95% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge et SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |
| SG-CAPTCHA challenge page with its constants in the page's scripts | 90% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ et SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si SiteGround SG-CAPTCHA est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par SiteGround SG-CAPTCHA sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche SiteGround SG-CAPTCHA avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
