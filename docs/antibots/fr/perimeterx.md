[English](../perimeterx.md) | [Español](../es/perimeterx.md) | [Русский](../ru/perimeterx.md) | [简体中文](../zh-CN/perimeterx.md) | [日本語](../ja/perimeterx.md) | [Português (Brasil)](../pt-BR/perimeterx.md) | [Deutsch](../de/perimeterx.md) | **Français** | [한국어](../ko/perimeterx.md)

# Protection anti-bot HUMAN (PerimeterX) : comment la détecter (et ce que cela implique pour le scraping)

HUMAN (PerimeterX) est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner HUMAN (PerimeterX), à détecter HUMAN (PerimeterX) sur un site ou à comprendre un web scraping bloqué par HUMAN (PerimeterX), la première étape est la même : confirmer que HUMAN (PerimeterX) est bien ce qui répond à vos requêtes. Cette page recense les 22 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots HUMAN (PerimeterX), le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

PerimeterX fait désormais partie de HUMAN Security. Son bot defender place un script sur la page et évalue les visiteurs selon leur comportement et des signaux d'appareil, et peut répondre par un défi de type appui prolongé.

Site officiel: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## Comment savoir si un site utilise HUMAN (PerimeterX)

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-perimeterx` (version de la règle 2.4.0, dernière mise à jour 2026-11-12). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### Cookies

Noms de cookies (et valeurs, lorsqu'une valeur est testée) définis sur la page. Les motifs sont des expressions régulières, sauf s'il s'agit de simples mots.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (corroboration seule) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| `^(?:_pxmvid\|_pxttld\|_pxwvm\|_pxmd\|_pxda\|_pxac)$` | 60% | Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac) |
| `^__pxvid$` | 60% | HUMAN Code Defender visitor cookie (__pxvid) |

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (corroboration seule) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |
| `^https://(?:[a-z0-9-]+\.)+(?:px-cloud\.net\|px-cdn\.net\|px-client\.net\|pxchk\.net\|perimeterx\.net\|hsprotect\.net)(?:[/?#:]\|$)` | 100% | Request to a HUMAN (PerimeterX) sensor, collector or challenge host |
| `^https?://[^/?#]+/(?:PX)?[A-Za-z0-9]{8}/xhr/api/v[0-9]/collector(?:[/?#]\|$)` | 85% | First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector) |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/init\.js(?:[?#]\|$)` | 30% (corroboration seule) | First-party init.js under an app-ID path without the PX prefix; corroboration only |

### Contenu de la page et des scripts

Texte trouvé dans la page ou dans ses scripts.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (corroboration seule) | Optional PerimeterX init callback defined by the site |
| `_pxUuid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxVid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxBlockedUrl (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxJsClientSrc (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |

### Éléments du DOM

Éléments repérés par un sélecteur CSS.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `div#px-captcha` | 60% | HUMAN challenge container (div#px-captcha) |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID ou First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) ou PerimeterX application ID ou PerimeterX collector endpoint) et (PerimeterX risk token cookie (_px2 or _px3) ou PerimeterX first-party server cookie ou PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | au moins 2 parmi : PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host et (PerimeterX application ID ou Script assigning the PerimeterX app ID (window._pxAppId) ou Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) et (PerimeterX application ID ou Script assigning the PerimeterX app ID (window._pxAppId) ou Optional PerimeterX init callback defined by the site) |
| First-party HUMAN sensor with its app ID or cookies | 95% | (First-party init.js under an app-ID path without the PX prefix; corroboration only ou First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector)) et (PerimeterX application ID ou Script assigning the PerimeterX app ID (window._pxAppId) ou Optional PerimeterX init callback defined by the site ou Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) ou Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac)) |
| HUMAN block page with its challenge | 95% | (HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) ou HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) ou HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) ou HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) ou HUMAN challenge container (div#px-captcha)) et (PerimeterX challenge (Press & Hold) script host ou First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) ou Request to a HUMAN (PerimeterX) sensor, collector or challenge host) |

## Difficulté

**Élevée.** Élevée signifie que l'extension considère cette protection comme l'une des plus difficiles à franchir : elle combine généralement des vérifications côté client avec un scoring comportemental ou côté serveur.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si HUMAN (PerimeterX) est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par HUMAN (PerimeterX) sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche HUMAN (PerimeterX) avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
