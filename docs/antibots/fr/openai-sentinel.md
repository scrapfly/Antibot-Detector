[English](../openai-sentinel.md) | [Español](../es/openai-sentinel.md) | [Русский](../ru/openai-sentinel.md) | [简体中文](../zh-CN/openai-sentinel.md) | [日本語](../ja/openai-sentinel.md) | [Português (Brasil)](../pt-BR/openai-sentinel.md) | [Deutsch](../de/openai-sentinel.md) | **Français** | [한국어](../ko/openai-sentinel.md)

# Protection anti-bot OpenAI Sentinel : comment la détecter (et ce que cela implique pour le scraping)

OpenAI Sentinel est une couche de protection anti-bot ou anti-abus que certains sites placent devant leurs pages. Que vous cherchiez à contourner OpenAI Sentinel, à détecter OpenAI Sentinel sur un site ou à comprendre un web scraping bloqué par OpenAI Sentinel, la première étape est la même : confirmer que OpenAI Sentinel est bien ce qui répond à vos requêtes. Cette page recense les 11 signaux publics que l'extension Scrapfly Antibot Detector utilise pour reconnaître la détection de bots OpenAI Sentinel, le degré de certitude de chacun et ce que cela signifie en général pour un client automatisé.

## De quoi s'agit-il

Sentinel est le nom de la couche anti-abus utilisée par ChatGPT et la connexion OpenAI. Elle envoie des défis au navigateur avant certaines requêtes. Elle protège les services propres à OpenAI et n'est pas un produit destiné à d'autres sites.

Site officiel: [https://chatgpt.com/](https://chatgpt.com/)

## Comment savoir si un site utilise OpenAI Sentinel

Ces signaux sont générés à partir des règles de détection de l'extension pour `detect-openai-sentinel` (version de la règle 2.1.1, dernière mise à jour 2026-11-04). Un signal n'est qu'un indice : la confiance indique le degré de certitude de l'extension lorsqu'elle observe ce signal précis. Les signaux marqués « corroboration seule » ne comptent jamais à eux seuls, car d'autres produits peuvent aussi les produire.

### URL des scripts et des requêtes

Adresses des scripts, des frames et des requêtes que la page charge. Ce sont des motifs comparés à l'adresse complète.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements(?:/[a-z]{3,12})?(?:[?#]\|$)` | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/sdk\.js(?:[?#]\|$)` | 100% | Sentinel SDK loader (/backend-api/sentinel/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/sentinel/[0-9a-z]{6,24}/sdk\.js(?:[?#]\|$)` | 100% | Versioned Sentinel SDK (/sentinel/<build>/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/frame\.html(?:[?#]\|$)` | 100% | Hidden Sentinel frame (/backend-api/sentinel/frame.html) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/req(?:[?#]\|$)` | 100% | Sentinel token request sent by the SDK (/backend-api/sentinel/req) |
| `^https://chatgpt\.com/(?:[a-z0-9-]{3,20}/)?assets/(?:[a-z]{2,12}-){0,4}sentinel(?:-[a-z]{2,12}){0,3}-[A-Za-z0-9_-]{8}\.js(?:[?#]\|$)` | 70% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) |

### Variables globales JavaScript (window)

Propriétés que le contexte JavaScript de la page expose sur `window`.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `SentinelSDK (typeof object)` | 75% | Sentinel SDK object (window.SentinelSDK) |

### Charges utiles des requêtes et des réponses

Données que la page envoie à une adresse correspondante, ou qu'elle en reçoit.

| Signal | Confiance | Ce que cela indique |
| --- | --- | --- |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/ ; body "p"\s*:\s*"gAAAAAC` | 100% | Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| `URL ^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements/finalize(?:[?#]\|$) ; body "proofofwork"\s*:\s*"gAAAAAB` | 100% | Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "proofofwork"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "so"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for session telemetry (so.required: true) |

### Combinaisons

Certains signaux pèsent plus lourd ensemble que séparément. L'extension signale aussi ces combinaisons.

| Combinaison | Confiance | Condition requise |
| --- | --- | --- |
| Chat-requirements request with its requirements token | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work et Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| Proof of work asked for and answered | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) et Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| Sentinel SDK with its frame or token request | 100% | (Sentinel SDK loader (/backend-api/sentinel/sdk.js) ou Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) et (Hidden Sentinel frame (/backend-api/sentinel/frame.html) ou Sentinel token request sent by the SDK (/backend-api/sentinel/req)) |
| Sentinel SDK object with its script | 90% | Sentinel SDK object (window.SentinelSDK) et (Sentinel SDK loader (/backend-api/sentinel/sdk.js) ou Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) |
| ChatGPT Sentinel scripts with Sentinel traffic | 90% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) et (Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint ou Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize ou Sentinel response asking for a proof of work (proofofwork.required: true)) |

## Difficulté

**Moyenne.** Moyenne signifie que l'extension considère cette protection comme un véritable obstacle : attendez-vous à des vérifications portant sur le navigateur, sur les détails de la requête, ou sur les deux, et à ce qu'elles évoluent avec le temps.

Cette note est la règle empirique propre à l'extension, et non une déclaration de l'éditeur ; la configuration d'un site peut rendre le même produit plus facile ou plus difficile à franchir.

## Ce que cela implique pour le scraping

Si OpenAI Sentinel est présent, une requête qui ne ressemble pas à une session de navigateur réelle et cohérente peut être soumise à un défi, retardée ou refusée, et la réponse peut être une page de défi ou de blocage au lieu du contenu souhaité. Ce qui se passe exactement dépend de la façon dont le propriétaire du site a configuré le produit, ce qui peut varier d'un site à l'autre et changer sans préavis. Considérez une détection comme une raison d'examiner la réponse que vous recevez réellement, et non comme la garantie d'un blocage.

Pour scraper des pages protégées par OpenAI Sentinel sans maintenir vous-même les solutions de contournement, consultez [la documentation Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) et [la Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) de Scrapfly. Ne scrapez que ce que vous avez le droit de scraper, et respectez les conditions d'utilisation et les règles robots du site.

## La détecter avec l'extension

Installez gratuitement [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) pour Chrome, ouvrez la page, et la fenêtre contextuelle affiche OpenAI Sentinel avec son niveau de confiance, sa difficulté et les signaux exacts qui ont correspondu. Pour en savoir plus, consultez le [README du projet](../../README.fr.md), ou voir [toutes les protections anti-bot détectées par l'extension](README.md).
