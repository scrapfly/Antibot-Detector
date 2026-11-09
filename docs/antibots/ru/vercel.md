[English](../vercel.md) | [Español](../es/vercel.md) | **Русский** | [简体中文](../zh-CN/vercel.md) | [日本語](../ja/vercel.md) | [Português (Brasil)](../pt-BR/vercel.md) | [Deutsch](../de/vercel.md) | [Français](../fr/vercel.md) | [한국어](../ko/vercel.md)

# Анти-бот защита Vercel Firewall: как определить, что сайт её использует (и что это значит для парсинга)

Vercel Firewall - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Vercel Firewall, хотите определить, использует ли сайт Vercel Firewall, или разбираетесь с блокировкой парсинга со стороны Vercel Firewall, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Vercel Firewall. На этой странице перечислены 9 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Vercel Firewall, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Vercel Firewall - уровень безопасности хостинг-платформы Vercel. Он включает настраиваемые правила, страницу проверки Attack Mode и проверку BotID.

Официальный сайт: [https://vercel.com/docs/vercel-firewall](https://vercel.com/docs/vercel-firewall)

## Как определить, что сайт использует Vercel Firewall

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-vercel` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-vercel-mitigated$: ^challenge$` | 100% | x-vercel-mitigated: challenge, the Vercel Firewall served its challenge |
| `^x-vercel-mitigated$: ^deny$` | 100% | x-vercel-mitigated: deny, the Vercel Firewall blocked the request |
| `^x-vercel-challenge-(?:token\|solution\|version)$` | 60% | x-vercel-challenge-token header of the Vercel Security Checkpoint |
| `^server$: ^Vercel$` | 15% (только для подтверждения) | Hosted on Vercel; hosting, not bot protection on its own |
| `^x-vercel-id$` | 15% (только для подтверждения) | Vercel request id header; present on any Vercel response |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/vercel/security/static/challenge(?:\.v[0-9]+)?(?:\.min)?\.js(?:[?#]\|$)` | 90% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ |
| `^https?://[^/?#]+/\.well-known/vercel/security/request-challenge(?:[?#]\|$)` | 50% (только для подтверждения) | Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge |
| `^https?://[^/?#]+/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/(?:a-4-a/c\|p)\.js(?:[?#]\|$)` | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3` | 30% | BotID path written in the page's scripts |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Vercel Security Checkpoint on a Vercel response | 100% | (x-vercel-mitigated: challenge, the Vercel Firewall served its challenge или x-vercel-mitigated: deny, the Vercel Firewall blocked the request или Vercel Security Checkpoint script under /.well-known/vercel/security/static/) и (Hosted on Vercel; hosting, not bot protection on its own или Vercel request id header; present on any Vercel response) |
| BotID script with its path in the page's scripts | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) и BotID path written in the page's scripts |
| Checkpoint script with its answer request or token | 95% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ и (Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge или x-vercel-challenge-token header of the Vercel Security Checkpoint) |
| Checkpoint token or answer request on a Vercel response | 85% | (x-vercel-challenge-token header of the Vercel Security Checkpoint или Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge) и (Hosted on Vercel; hosting, not bot protection on its own или Vercel request id header; present on any Vercel response) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Vercel Firewall присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Vercel Firewall, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Vercel Firewall с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
