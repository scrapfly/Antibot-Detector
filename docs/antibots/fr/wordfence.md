[English](../wordfence.md) | [Español](../es/wordfence.md) | [Русский](../ru/wordfence.md) | [简体中文](../zh-CN/wordfence.md) | [日本語](../ja/wordfence.md) | [Português (Brasil)](../pt-BR/wordfence.md) | [Deutsch](../de/wordfence.md) | **Français** | [한국어](../ko/wordfence.md)

# Protection anti-bot Wordfence : comment la détecter (et ce que cela implique pour le scraping)

Wordfence est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner Wordfence, à détecter Wordfence sur un site ou à comprendre un web scraping bloqué par Wordfence, la première étape est la même : confirmer que Wordfence est bien ce qui répond à vos requêtes. Cette page recense les 19 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots Wordfence, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Wordfence est un plugin de sécurité WordPress très répandu. Il ajoute un pare-feu, une limitation de débit et une protection de la connexion à un site WordPress unique.

Site officiel: [https://www.wordfence.com/](https://www.wordfence.com/)

## Comment savoir si un site utilise Wordfence

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-wordfence` (version de la règle 2.0.0, dernière mise à jour 2026-10-26). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^wfwaf-authcookie-[0-9a-f]{32}$` | 60% | Wordfence firewall cookie wfwaf-authcookie-<hash> set for logged-in users |
| `^wf_loginalerted_[0-9a-f]{64}$` | 60% | Wordfence new-device login alert cookie wf_loginalerted_<hash> |
| `^wfls-remembered-[A-Za-z0-9_-]{20,24}$` | 60% | Wordfence Login Security cookie wfls-remembered-<id> for a device that passed 2FA |
| `^wfCBLBypass$ = ^[0-9a-f]{13}$` | 60% | Wordfence country blocking bypass cookie wfCBLBypass |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence(?:-login-security)?/(?:modules/login-security/)?js/(?:login\|wflsi18n)\.\d+(?:\.min)?\.js(?:[?#]\|$)` | 90% | Wordfence Login Security login script or its translations |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence/(?:js\|css)/[\w.-]+\.(?:js\|css)(?:[?#]\|$)` | 80% | Script or stylesheet from the Wordfence plugin's own js or css folder |
| `^https?://[^/?#]+/(?:[^?#]*/)?\?wordfence_lh=1&hid=` | 50% | Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `WFLSVars` | 30% | Script defining WFLSVars, the Wordfence Login Security settings |
| `WFAJAXWatcherVars` | 30% | Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings |
| `wfLogHumanRan` | 20% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) |
| `_wfsf=unlockEmail` | 20% | Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) |
| `user-reports.wordfence` | 20% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `WFLSVars (typeof object)` | 60% | Wordfence Login Security settings object |
| `WFLSVars.useCAPTCHA (truthy)` | 60% | Wordfence Login Security reCAPTCHA turned on |
| `wordfenceAJAXWatcher (typeof object)` | 60% | Wordfence firewall watcher object |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `a[href="https://www.wordfence.com/help/?query=locked-out"]` | 30% (corroboration seule) | Locked-out documentation link on the Wordfence block page |
| `input#unlock-email` | 20% (corroboration seule) | Unlock email field on the Wordfence block page |
| `input[name="wfwaf-false-positive-verified"]` | 50% | Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins |
| `a#reportButton` | 10% (corroboration seule) | Report Problem button on the Wordfence blocklist page |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Login Security script with its settings | 100% | Wordfence Login Security login script or its translations et (Wordfence Login Security settings object ou Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security with reCAPTCHA turned on | 100% | Wordfence Login Security reCAPTCHA turned on et (Wordfence Login Security login script or its translations ou Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security settings in a script and at runtime | 90% | Script defining WFLSVars, the Wordfence Login Security settings et Wordfence Login Security settings object |
| Live Traffic script and its report request | 85% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) et Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |
| Firewall watcher script with its settings | 90% | Script or stylesheet from the Wordfence plugin's own js or css folder et (Wordfence firewall watcher object ou Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings) |
| Wordfence block page help link with its unlock form or allowlist field | 85% | Locked-out documentation link on the Wordfence block page et (Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) ou Unlock email field on the Wordfence block page ou Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins) |
| Wordfence blocklist page report script and button | 80% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) et Report Problem button on the Wordfence blocklist page |

## Difficulté

**Faible.** Faible signifie que l'extension considère cette protection comme un obstacle léger : elle ne filtre généralement que les clients simples, et un vrai navigateur ou une requête bien formée, semblable à celle d'un navigateur, passe souvent.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si Wordfence est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par Wordfence sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche Wordfence avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
