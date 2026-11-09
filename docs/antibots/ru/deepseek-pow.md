[English](../deepseek-pow.md) | [Español](../es/deepseek-pow.md) | **Русский** | [简体中文](../zh-CN/deepseek-pow.md) | [日本語](../ja/deepseek-pow.md) | [Português (Brasil)](../pt-BR/deepseek-pow.md) | [Deutsch](../de/deepseek-pow.md) | [Français](../fr/deepseek-pow.md) | [한국어](../ko/deepseek-pow.md)

# Анти-бот защита DeepSeek PoW: как определить, что сайт её использует (и что это значит для парсинга)

DeepSeek PoW - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода DeepSeek PoW, хотите определить, использует ли сайт DeepSeek PoW, или разбираетесь с блокировкой парсинга со стороны DeepSeek PoW, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает DeepSeek PoW. На этой странице перечислены 5 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту DeepSeek PoW, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Веб-приложение чата DeepSeek просит браузер решить задачу proof-of-work, прежде чем принять запрос в чат. Это собственная защита сервиса, а не продукт, продаваемый другим сайтам.

Официальный сайт: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## Как определить, что сайт использует DeepSeek PoW

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-deepseek-pow` (версия правила 2.1.1, последнее обновление 2026-11-04). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (только для подтверждения) | Chat completion request, the path the proof of work is issued for |

### Тела запросов и ответов

Данные, которые страница отправляет на подходящий адрес или получает с него.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) и Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) и Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) и Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) и Chat completion request, the path the proof of work is issued for |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если DeepSeek PoW присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые DeepSeek PoW, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится DeepSeek PoW с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
