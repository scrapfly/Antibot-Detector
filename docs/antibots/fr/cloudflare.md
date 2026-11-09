[English](../cloudflare.md) | [Español](../es/cloudflare.md) | [Русский](../ru/cloudflare.md) | [简体中文](../zh-CN/cloudflare.md) | [日本語](../ja/cloudflare.md) | [Português (Brasil)](../pt-BR/cloudflare.md) | [Deutsch](../de/cloudflare.md) | **Français** | [한국어](../ko/cloudflare.md)

# Protection anti-bot Cloudflare Bot Management : comment la détecter (et ce que cela implique pour le scraping)

Cloudflare Bot Management est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Cloudflare Bot Management, à détecter Cloudflare Bot Management sur un site ou à comprendre un web scraping bloqué par Cloudflare Bot Management, la première étape est la même : confirmer que Cloudflare Bot Management est bien ce qui répond à vos requêtes. Cette page recense les 11 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Cloudflare Bot Management, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Cloudflare Bot Management est le produit payant de détection de bots de Cloudflare, diffusé depuis son réseau mondial. Cloudflare propose aussi des pages de défi gratuites : un défi Cloudflare ne signifie donc pas à lui seul que le produit payant est activé.

Site officiel: [https://www.cloudflare.com/products/bot-management/](https://www.cloudflare.com/products/bot-management/)

## Comment savoir si un site utilise Cloudflare Bot Management

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-cloudflare` (version de la règle 2.3.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^cf_clearance$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Challenge clearance cookie, set after passing a Cloudflare challenge |
| `^__cf_bm$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}\.[0-9]{5,8}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode |
| `^cf_chl_rc_(?:i\|ni\|m)$` | 85% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) |

### En-têtes de réponse

En-têtes de réponse HTTP renvoyés par la page ou par ses requêtes.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^cf-mitigated$: ^challenge$` | 100% | Response header Cloudflare sends when it served a challenge page |
| `^server$: ^cloudflare$` | 15% (corroboration seule) | Served through Cloudflare; CDN delivery, not bot management on its own |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?orchestrate/(?:chl_page\|managed\|jsch\|captcha)/` | 100% | Challenge page orchestrator under /cdn-cgi/challenge-platform/ |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?scripts/jsd/(?:[0-9a-f]{6,20}/)?main\.js(?:[?#]\|$)` | 100% | Bot Management JavaScript detections script |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?jsd/oneshot/` | 100% | Bot Management JavaScript detections report (/cdn-cgi/challenge-platform/…/jsd/oneshot/) |
| `^https://challenges\.cloudflare\.com/` | 40% (corroboration seule) | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `_cf_chl_opt` | 20% | Script reference to the _cf_chl_opt challenge options object |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `_cf_chl_opt (typeof object)` | 85% | Challenge options object present on a Cloudflare challenge page |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Challenge page orchestrator and challenge options object | 100% | (Challenge page orchestrator under /cdn-cgi/challenge-platform/ ou Response header Cloudflare sends when it served a challenge page) et (Challenge options object present on a Cloudflare challenge page ou Script reference to the _cf_chl_opt challenge options object) |
| Clearance cookie with Bot Management cookie | 85% | Challenge clearance cookie, set after passing a Cloudflare challenge et (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode ou Served through Cloudflare; CDN delivery, not bot management on its own) |
| Bot Management script on a Cloudflare zone | 75% | Bot Management JavaScript detections script et (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode ou Served through Cloudflare; CDN delivery, not bot management on its own) |
| Challenge host request on a Cloudflare zone with a challenge signal | 90% | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only et (Challenge clearance cookie, set after passing a Cloudflare challenge ou Challenge options object present on a Cloudflare challenge page ou Challenge page orchestrator under /cdn-cgi/challenge-platform/) |
| Challenge platform cookie with a Cloudflare clearance, server header or challenge | 95% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) et (Challenge clearance cookie, set after passing a Cloudflare challenge ou Served through Cloudflare; CDN delivery, not bot management on its own ou Challenge page orchestrator under /cdn-cgi/challenge-platform/ ou Challenge options object present on a Cloudflare challenge page) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Cloudflare Bot Management est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Cloudflare Bot Management sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Cloudflare Bot Management avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
