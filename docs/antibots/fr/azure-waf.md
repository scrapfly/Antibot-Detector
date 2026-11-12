[English](../azure-waf.md) | [Español](../es/azure-waf.md) | [Русский](../ru/azure-waf.md) | [简体中文](../zh-CN/azure-waf.md) | [日本語](../ja/azure-waf.md) | [Português (Brasil)](../pt-BR/azure-waf.md) | [Deutsch](../de/azure-waf.md) | **Français** | [한국어](../ko/azure-waf.md)

# Protection anti-bot Azure WAF : comment la détecter (et ce que cela implique pour le scraping)

Azure WAF est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Azure WAF, à détecter Azure WAF sur un site ou à comprendre un web scraping bloqué par Azure WAF, la première étape est la même : confirmer que Azure WAF est bien ce qui répond à vos requêtes. Cette page recense les 3 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Azure WAF, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Azure Web Application Firewall est le WAF de Microsoft pour Azure Front Door et Application Gateway. En plus de bloquer les attaques, ses règles anti-bots peuvent répondre aux clients suspects par un défi JavaScript ou, sur Front Door, par un CAPTCHA.

Site officiel: [https://learn.microsoft.com/azure/web-application-firewall/](https://learn.microsoft.com/azure/web-application-firewall/)

## Comment savoir si un site utilise Azure WAF

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-azure-waf` (version de la règle 2.0.0, dernière mise à jour 2026-11-12). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^afd_azwaf_jsclearance$` | 90% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^appgw_azwaf_jsclearance$` | 90% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^afd_azwaf_captcha$` | 90% | afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Front Door JavaScript challenge and CAPTCHA cookies | 100% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) et afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |
| JavaScript challenge cookies of Front Door and Application Gateway | 95% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) et appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| Application Gateway JavaScript challenge cookie with the Front Door CAPTCHA cookie | 95% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) et afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Azure WAF est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Azure WAF sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Azure WAF avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
