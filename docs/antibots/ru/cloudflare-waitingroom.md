[English](../cloudflare-waitingroom.md) | [Español](../es/cloudflare-waitingroom.md) | **Русский** | [简体中文](../zh-CN/cloudflare-waitingroom.md) | [日本語](../ja/cloudflare-waitingroom.md) | [Português (Brasil)](../pt-BR/cloudflare-waitingroom.md) | [Deutsch](../de/cloudflare-waitingroom.md) | [Français](../fr/cloudflare-waitingroom.md) | [한국어](../ko/cloudflare-waitingroom.md)

# Анти-бот защита Cloudflare Waiting Room: как определить, что сайт её использует (и что это значит для парсинга)

Cloudflare Waiting Room - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Cloudflare Waiting Room, хотите определить, использует ли сайт Cloudflare Waiting Room, или разбираетесь с блокировкой парсинга со стороны Cloudflare Waiting Room, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Cloudflare Waiting Room. На этой странице перечислены 3 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Cloudflare Waiting Room, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Cloudflare Waiting Room - функция Cloudflare, которая ставит посетителей в очередь, когда сайт ожидает больше трафика, чем способен выдержать его исходный сервер. Это инструмент управления трафиком, а не детектор ботов, но страница очереди всё равно останавливает простых парсеров.

Официальный сайт: [https://developers.cloudflare.com/waiting-room/](https://developers.cloudflare.com/waiting-room/)

## Как определить, что сайт использует Cloudflare Waiting Room

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-cloudflare-waitingroom` (версия правила 2.1.0, последнее обновление 2026-10-16). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^__cfwaitingroom$` | 100% | Waiting Room cookie that keeps the visitor's place in the queue |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^server$: ^cloudflare$` | 15% (только для подтверждения) | Served through Cloudflare; CDN delivery, not a queue on its own |
| `^cf-ray$: ^[0-9a-f]{12,20}-[A-Z]{3,4}$` | 15% (только для подтверждения) | Cloudflare request id header; present on any Cloudflare response |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Queue cookie on a Cloudflare response | 85% | Waiting Room cookie that keeps the visitor's place in the queue и Served through Cloudflare; CDN delivery, not a queue on its own |
| Queue cookie with a Cloudflare request id | 80% | Waiting Room cookie that keeps the visitor's place in the queue и Cloudflare request id header; present on any Cloudflare response |
| Queue cookie with Cloudflare server and request id | 100% | Waiting Room cookie that keeps the visitor's place in the queue и Served through Cloudflare; CDN delivery, not a queue on its own и Cloudflare request id header; present on any Cloudflare response |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Cloudflare Waiting Room присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Cloudflare Waiting Room, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Cloudflare Waiting Room с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
