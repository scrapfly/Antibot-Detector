[English](../cheq.md) | [Español](../es/cheq.md) | **Русский** | [简体中文](../zh-CN/cheq.md) | [日本語](../ja/cheq.md) | [Português (Brasil)](../pt-BR/cheq.md) | [Deutsch](../de/cheq.md) | [Français](../fr/cheq.md) | [한국어](../ko/cheq.md)

# Анти-бот защита Cheq: как определить, что сайт её использует (и что это значит для парсинга)

Cheq - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Cheq, хотите определить, использует ли сайт Cheq, или разбираетесь с блокировкой парсинга со стороны Cheq, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Cheq. На этой странице перечислены 12 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Cheq, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

CHEQ - компания в области go-to-market безопасности, которая продаёт защиту от ботов, недействительного трафика и мошенничества, в основном для рекламного и маркетингового трафика.

Официальный сайт: [https://cheq.ai/](https://cheq.ai/)

## Как определить, что сайт использует Cheq

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-cheq` (версия правила 2.2.0, последнее обновление 2026-10-17). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (только для подтверждения) | Other CHEQ cookies |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (только для подтверждения) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (только для подтверждения) | CHEQ queue object (_cq) |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class или CHEQ tag with its JSONP callback attribute или CHEQ ClickTrue host (cheqzone.com)) и (CHEQ SDK global или CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie или Other CHEQ cookies) и (CHEQ queue object (_cq) или CHEQ JSONP callback name или CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host и (CHEQ visitor/session id cookie или Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai) и (CHEQ SDK global или CHEQ queue object (_cq) или CHEQ visitor/session id cookie или Other CHEQ cookies)) или ((ClickTrue tag; served from a disguised random host, identified by its class или CHEQ tag with its JSONP callback attribute или CHEQ ClickTrue host (cheqzone.com)) и (CHEQ queue object (_cq) или Other CHEQ cookies)) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Cheq присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Cheq, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Cheq с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
