[English](../queueit.md) | [Español](../es/queueit.md) | **Русский** | [简体中文](../zh-CN/queueit.md) | [日本語](../ja/queueit.md) | [Português (Brasil)](../pt-BR/queueit.md) | [Deutsch](../de/queueit.md) | [Français](../fr/queueit.md) | [한국어](../ko/queueit.md)

# Анти-бот защита Queue-it: как определить, что сайт её использует (и что это значит для парсинга)

Queue-it - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Queue-it, хотите определить, использует ли сайт Queue-it, или разбираетесь с блокировкой парсинга со стороны Queue-it, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Queue-it. На этой странице перечислены 9 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Queue-it, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Queue-it - сервис виртуальной комнаты ожидания. Он направляет посетителей на страницу очереди, когда сайт перегружен, например во время продажи билетов или товаров. Он управляет трафиком, а не обнаруживает ботов, хотя и предлагает параметры фильтрации ботов.

Официальный сайт: [https://queue-it.com/](https://queue-it.com/)

## Как определить, что сайт использует Queue-it

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-queueit` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^QueueITAccepted-SDFrts345E-V3_` | 60% | Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue |
| `^Queue-it-visitorsession$` | 100% | Queue-it-visitorsession cookie set by the queue page |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://static\.queue-it\.net/script/(?:queueclient\|queueconfigloader)(?:\.min)?\.js(?:[?#]\|$)` | 100% | Queue-it JavaScript connector loaded from static.queue-it.net |
| `^https?://assets\.queue-it\.net/[a-z0-9_-]+/integrationconfig/javascript/queueclientConfig\.js` | 100% | Queue-it integration config requested from assets.queue-it.net |
| `^https?://assets\.queue-it\.net/static/QueueFront/` | 100% | Queue page scripts and images from assets.queue-it.net/static/QueueFront/ |
| `^https?://(?!(?:go\|static\|assets\|www)\.)[a-z0-9-]+\.queue-it\.net/` | 100% | Queue-it queue page on a customer subdomain of queue-it.net |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?queueittoken=` | 40% (только для подтверждения) | queueittoken parameter in the page address after leaving the queue |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `QueueIt.Javascript (typeof object)` | 60% | QueueIt.Javascript object created by the Queue-it connector |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `script[data-queueit-c]` | 50% | Queue-it connector script tag with its data-queueit-c customer attribute |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Connector script with its runtime or tag | 100% | (Queue-it JavaScript connector loaded from static.queue-it.net или Queue-it integration config requested from assets.queue-it.net) и (QueueIt.Javascript object created by the Queue-it connector или Queue-it connector script tag with its data-queueit-c customer attribute) |
| Queue page with its scripts or session cookie | 100% | Queue-it queue page on a customer subdomain of queue-it.net и (Queue page scripts and images from assets.queue-it.net/static/QueueFront/ или Queue-it-visitorsession cookie set by the queue page) |
| Back from the queue with its token or cookie | 90% | (queueittoken parameter in the page address after leaving the queue или Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue) и (Queue-it JavaScript connector loaded from static.queue-it.net или Queue-it integration config requested from assets.queue-it.net или QueueIt.Javascript object created by the Queue-it connector или Queue-it connector script tag with its data-queueit-c customer attribute) |
| Connector tag with the Queue-it runtime | 85% | Queue-it connector script tag with its data-queueit-c customer attribute и QueueIt.Javascript object created by the Queue-it connector |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Queue-it присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Queue-it, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Queue-it с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
