[English](../aws-waf.md) | [Español](../es/aws-waf.md) | [Русский](../ru/aws-waf.md) | [简体中文](../zh-CN/aws-waf.md) | [日本語](../ja/aws-waf.md) | [Português (Brasil)](../pt-BR/aws-waf.md) | [Deutsch](../de/aws-waf.md) | **Français** | [한국어](../ko/aws-waf.md)

# Protection anti-bot AWS WAF : comment la détecter (et ce que cela implique pour le scraping)

AWS WAF est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner AWS WAF, à détecter AWS WAF sur un site ou à comprendre un web scraping bloqué par AWS WAF, la première étape est la même : confirmer que AWS WAF est bien ce qui répond à vos requêtes. Cette page recense les 14 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots AWS WAF, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

AWS WAF est le pare-feu applicatif web d'Amazon Web Services. Ses fonctions Bot Control et de défi peuvent exiger qu'un navigateur exécute un défi JavaScript et conserve un jeton, de sorte qu'un simple client HTTP peut être refusé.

Site officiel: [https://aws.amazon.com/waf/](https://aws.amazon.com/waf/)

## Comment savoir si un site utilise AWS WAF

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-aws-waf` (version de la règle 2.3.0, dernière mise à jour 2026-11-12). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^aws-waf-token$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9+/=_:-]{20,}` | 100% | AWS WAF token cookie set after a challenge |
| `^aws-waf-token$` | 85% | AWS WAF token cookie by name; its value format is not documented |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^x-amzn-waf-action$: ^(?:challenge\|captcha)$` | 100% | AWS WAF challenge or captcha action header |
| `^x-amzn-waf-challenge-id$` | 40% (corroboration seule) | AWS WAF challenge id header |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:challenge\|captcha\|jsapi)\.js(?:[?#]\|$)` | 100% | Integration SDK from the regional token.awswaf.com host |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:inputs\|verify\|telemetry\|voucher\|mp_verify)(?:[?#/]\|$)` | 100% | Any request to the regional token.awswaf.com host (inputs, verify, telemetry) |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.captcha\.awswaf\.com/` | 100% | AWS WAF CAPTCHA host |
| `^https://(?:[a-z0-9-]+\.)+awswaf\.com(?:[/?#:]\|$)` | 100% | Any request to an AWS WAF host (*.awswaf.com) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `gokuProps` | 15% (corroboration seule) | Challenge page bootstrap variable (window.gokuProps) |
| `AwsWafIntegration` | 10% | Integration SDK namespace reference |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `AwsWafIntegration (typeof object)` | 75% | AWS WAF Integration SDK object |
| `gokuProps (typeof object)` | 70% | Challenge page bootstrap object (gokuProps) |
| `AwsWafCaptcha (typeof object)` | 75% | AWS WAF Integration SDK object |
| `awsWafCookieDomainList (exists)` | 30% (corroboration seule) | Token cookie domain list for the Integration SDK |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Challenge response with its bootstrap | 100% | (AWS WAF challenge or captcha action header ou AWS WAF challenge id header) et (Challenge page bootstrap object (gokuProps) ou Challenge page bootstrap variable (window.gokuProps) ou Integration SDK from the regional token.awswaf.com host) |
| Integration SDK with token traffic or cookie | 100% | (Integration SDK from the regional token.awswaf.com host ou AWS WAF Integration SDK object) et (AWS WAF token cookie set after a challenge ou Any request to the regional token.awswaf.com host (inputs, verify, telemetry) ou Token cookie domain list for the Integration SDK) |
| Token cookie with SDK reference | 90% | (AWS WAF token cookie set after a challenge ou AWS WAF token cookie by name; its value format is not documented) et (Integration SDK namespace reference ou Challenge page bootstrap variable (window.gokuProps) ou Token cookie domain list for the Integration SDK) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si AWS WAF est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par AWS WAF sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche AWS WAF avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
