[English](../iovation.md) | [Español](../es/iovation.md) | **Русский** | [简体中文](../zh-CN/iovation.md) | [日本語](../ja/iovation.md) | [Português (Brasil)](../pt-BR/iovation.md) | [Deutsch](../de/iovation.md) | [Français](../fr/iovation.md) | [한국어](../ko/iovation.md)

# Анти-бот защита iovation (TransUnion TruValidate): как определить, что сайт её использует (и что это значит для парсинга)

iovation (TransUnion TruValidate) - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода iovation (TransUnion TruValidate), хотите определить, использует ли сайт iovation (TransUnion TruValidate), или разбираетесь с блокировкой парсинга со стороны iovation (TransUnion TruValidate), первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает iovation (TransUnion TruValidate). На этой странице перечислены 9 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту iovation (TransUnion TruValidate), насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

iovation - сервис распознавания устройств и защиты от мошенничества, ныне часть TransUnion под названием TruValidate. Его скрипт собирает "чёрный ящик" устройства, который сайт отправляет при важных действиях.

Официальный сайт: [https://www.iovation.com/](https://www.iovation.com/)

## Как определить, что сайт использует iovation (TransUnion TruValidate)

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-iovation` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (только для подтверждения) | iovation logo.js served through the site's own /iojs/ proxy |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (только для подтверждения) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (только для подтверждения) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (только для подтверждения) | io_global_object_name setting read by the iovation scripts |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (только для подтверждения) | Hidden ioBlackBox field that receives the iovation blackbox |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) или iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) и (IGLOO.getBlackbox function of the iovation loader или IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy или iovation logo.js served through the site's own /iojs/ proxy) и (IGLOO.getBlackbox function of the iovation loader или IGLOO.fp object created by the iovation profiling scripts или io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader или IGLOO.fp object created by the iovation profiling scripts) и (io_global_object_name setting read by the iovation scripts или iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) или Hidden ioBlackBox field that receives the iovation blackbox) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если iovation (TransUnion TruValidate) присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые iovation (TransUnion TruValidate), не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится iovation (TransUnion TruValidate) с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
