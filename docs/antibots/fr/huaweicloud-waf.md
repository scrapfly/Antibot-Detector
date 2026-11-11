[English](../huaweicloud-waf.md) | [Español](../es/huaweicloud-waf.md) | [Русский](../ru/huaweicloud-waf.md) | [简体中文](../zh-CN/huaweicloud-waf.md) | [日本語](../ja/huaweicloud-waf.md) | [Português (Brasil)](../pt-BR/huaweicloud-waf.md) | [Deutsch](../de/huaweicloud-waf.md) | **Français** | [한국어](../ko/huaweicloud-waf.md)

# Protection anti-bot Huawei Cloud WAF : comment la détecter (et ce que cela implique pour le scraping)

Huawei Cloud WAF est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Huawei Cloud WAF, à détecter Huawei Cloud WAF sur un site ou à comprendre un web scraping bloqué par Huawei Cloud WAF, la première étape est la même : confirmer que Huawei Cloud WAF est bien ce qui répond à vos requêtes. Cette page recense les 3 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Huawei Cloud WAF, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Huawei Cloud WAF est le pare-feu applicatif web de Huawei Cloud. Sur un site connecté, il ajoute des cookies de session aux requêtes des visiteurs, que ses règles de protection contre les attaques CC et anti-crawler utilisent pour compter et suivre les requêtes.

Site officiel: [https://www.huaweicloud.com/intl/en-us/product/waf.html](https://www.huaweicloud.com/intl/en-us/product/waf.html)

## Comment savoir si un site utilise Huawei Cloud WAF

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-huaweicloud-waf` (version de la règle 2.0.0, dernière mise à jour 2026-11-11). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^HWWAFSESID$` | 90% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| `^HWWAFSESTIME$` | 90% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^server$: HuaweiCloudWAF` | 40% (corroboration seule) | Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Both WAF session cookies | 100% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) et HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| Session ID cookie with the WAF server header | 95% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) et Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |
| Session timestamp cookie with the WAF server header | 95% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) et Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Huawei Cloud WAF est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Huawei Cloud WAF sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Huawei Cloud WAF avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
