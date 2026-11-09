[English](../seon.md) | [Español](../es/seon.md) | **Русский** | [简体中文](../zh-CN/seon.md) | [日本語](../ja/seon.md) | [Português (Brasil)](../pt-BR/seon.md) | [Deutsch](../de/seon.md) | [Français](../fr/seon.md) | [한국어](../ko/seon.md)

# Анти-бот защита SEON: как определить, что сайт её использует (и что это значит для парсинга)

SEON - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода SEON, хотите определить, использует ли сайт SEON, или разбираетесь с блокировкой парсинга со стороны SEON, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает SEON. На этой странице перечислены 7 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту SEON, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

SEON - компания по защите от мошенничества. Его JavaScript-агент собирает сигналы об устройстве и сети, которые используются в оценке рисков.

Официальный сайт: [https://seon.io/](https://seon.io/)

## Как определить, что сайт использует SEON

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-seon` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://cdn\.(?:seondf\|dfsdk\|deviceinf\|seonintelligence)\.com/js/v\d+/agent(?:\.umd)?\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts |
| `^https://cdn\.seon\.io/js/v\d+/agent\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host |
| `^https://[0-9a-f]{16,64}\.seondnsresolve\.com/` | 100% | SEON agent network probe to a seondnsresolve.com host |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `\bseon\.(?:getSession\|getBase64Session\|config)\s*\(` | 20% (только для подтверждения) | SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `seon.getSession (typeof function)` | 60% | seon.getSession function of the SEON v6 agent |
| `seon.getBase64Session (typeof function)` | 60% | seon.getBase64Session function of the SEON v5 agent |
| `webpackChunkseon_javascript_sdk (exists)` | 50% (только для подтверждения) | webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| SEON agent from its host with its runtime | 100% | (SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts или SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host или SEON agent network probe to a seondnsresolve.com host) и (seon.getSession function of the SEON v6 agent или seon.getBase64Session function of the SEON v5 agent или webpackChunkseon_javascript_sdk global left by the SEON v5 agent) |
| SEON agent with its calls | 85% | (seon.getSession function of the SEON v6 agent или seon.getBase64Session function of the SEON v5 agent или webpackChunkseon_javascript_sdk global left by the SEON v5 agent) и SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |
| SEON v5 agent function with its runtime | 80% | seon.getBase64Session function of the SEON v5 agent и webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если SEON присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые SEON, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится SEON с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
