[English](../openai-sentinel.md) | [Español](../es/openai-sentinel.md) | **Русский** | [简体中文](../zh-CN/openai-sentinel.md) | [日本語](../ja/openai-sentinel.md) | [Português (Brasil)](../pt-BR/openai-sentinel.md) | [Deutsch](../de/openai-sentinel.md) | [Français](../fr/openai-sentinel.md) | [한국어](../ko/openai-sentinel.md)

# Анти-бот защита OpenAI Sentinel: как определить, что сайт её использует (и что это значит для парсинга)

OpenAI Sentinel - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода OpenAI Sentinel, хотите определить, использует ли сайт OpenAI Sentinel, или разбираетесь с блокировкой парсинга со стороны OpenAI Sentinel, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает OpenAI Sentinel. На этой странице перечислены 11 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту OpenAI Sentinel, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Sentinel - название анти-бот уровня, используемого в ChatGPT и при входе в OpenAI. Он выдаёт браузеру проверки перед некоторыми запросами. Он защищает собственные сервисы OpenAI и не является продуктом для других сайтов.

Официальный сайт: [https://chatgpt.com/](https://chatgpt.com/)

## Как определить, что сайт использует OpenAI Sentinel

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-openai-sentinel` (версия правила 2.1.1, последнее обновление 2026-11-04). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements(?:/[a-z]{3,12})?(?:[?#]\|$)` | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/sdk\.js(?:[?#]\|$)` | 100% | Sentinel SDK loader (/backend-api/sentinel/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/sentinel/[0-9a-z]{6,24}/sdk\.js(?:[?#]\|$)` | 100% | Versioned Sentinel SDK (/sentinel/<build>/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/frame\.html(?:[?#]\|$)` | 100% | Hidden Sentinel frame (/backend-api/sentinel/frame.html) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/req(?:[?#]\|$)` | 100% | Sentinel token request sent by the SDK (/backend-api/sentinel/req) |
| `^https://chatgpt\.com/(?:[a-z0-9-]{3,20}/)?assets/(?:[a-z]{2,12}-){0,4}sentinel(?:-[a-z]{2,12}){0,3}-[A-Za-z0-9_-]{8}\.js(?:[?#]\|$)` | 70% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `SentinelSDK (typeof object)` | 75% | Sentinel SDK object (window.SentinelSDK) |

### Тела запросов и ответов

Данные, которые страница отправляет на подходящий адрес или получает с него.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/ ; body "p"\s*:\s*"gAAAAAC` | 100% | Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| `URL ^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements/finalize(?:[?#]\|$) ; body "proofofwork"\s*:\s*"gAAAAAB` | 100% | Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "proofofwork"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "so"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for session telemetry (so.required: true) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Chat-requirements request with its requirements token | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work и Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| Proof of work asked for and answered | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) и Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| Sentinel SDK with its frame or token request | 100% | (Sentinel SDK loader (/backend-api/sentinel/sdk.js) или Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) и (Hidden Sentinel frame (/backend-api/sentinel/frame.html) или Sentinel token request sent by the SDK (/backend-api/sentinel/req)) |
| Sentinel SDK object with its script | 90% | Sentinel SDK object (window.SentinelSDK) и (Sentinel SDK loader (/backend-api/sentinel/sdk.js) или Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) |
| ChatGPT Sentinel scripts with Sentinel traffic | 90% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) и (Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint или Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize или Sentinel response asking for a proof of work (proofofwork.required: true)) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если OpenAI Sentinel присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые OpenAI Sentinel, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится OpenAI Sentinel с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
