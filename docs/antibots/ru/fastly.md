[English](../fastly.md) | [Español](../es/fastly.md) | **Русский** | [简体中文](../zh-CN/fastly.md) | [日本語](../ja/fastly.md) | [Português (Brasil)](../pt-BR/fastly.md) | [Deutsch](../de/fastly.md) | [Français](../fr/fastly.md) | [한국어](../ko/fastly.md)

# Анти-бот защита Fastly Bot Management: как определить, что сайт её использует (и что это значит для парсинга)

Fastly Bot Management - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Fastly Bot Management, хотите определить, использует ли сайт Fastly Bot Management, или разбираетесь с блокировкой парсинга со стороны Fastly Bot Management, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Fastly Bot Management. На этой странице перечислены 6 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Fastly Bot Management, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Fastly Bot Management - продукт для обнаружения ботов от Fastly, провайдера периферийного облака. Он работает через периферийную сеть Fastly и, согласно его детектору, может также выполнять клиентские проверки.

Официальный сайт: [https://www.fastly.com/products/bot-management](https://www.fastly.com/products/bot-management)

## Как определить, что сайт использует Fastly Bot Management

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-fastly` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^_fs_ch_st_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge start cookie (_fs_ch_st_<random>) |
| `^_fs_ch_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly challenge complete cookie (_fs_ch_cp_<random>) |
| `^_fs_cd_cp_[A-Za-z0-9_-]{4,}$` | 100% | Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/challenge\.js(?:[?#]\|$)` | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path |
| `^https?://[^/?#]+/_fs-ch-[A-Za-z0-9]{8,32}/assets/[A-Za-z0-9_.-]{1,64}\.js(?:[?#]\|$)` | 100% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `div.fastly-challenge` | 40% | Embedded Fastly dynamic challenge container (div.fastly-challenge) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Fastly challenge script with its cookie or container | 100% | Fastly client challenge script on the site's own /_fs-ch-<token>/ path и (Fastly challenge start cookie (_fs_ch_st_<random>) или Fastly challenge complete cookie (_fs_ch_cp_<random>) или Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly challenge complete cookie with its start cookie or container | 95% | Fastly challenge complete cookie (_fs_ch_cp_<random>) и (Fastly challenge start cookie (_fs_ch_st_<random>) или Embedded Fastly dynamic challenge container (div.fastly-challenge)) |
| Fastly detection script with its cookie | 95% | Fastly client-side detection script on the site's own /_fs-ch-<token>/assets/ path и Fastly client-side detection cookie (_fs_cd_cp_<random>), set once its script ran |
| Fastly challenge container with its start cookie | 90% | Embedded Fastly dynamic challenge container (div.fastly-challenge) и Fastly challenge start cookie (_fs_ch_st_<random>) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Fastly Bot Management присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Fastly Bot Management, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Fastly Bot Management с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
