[English](../forter.md) | [Español](../es/forter.md) | **Русский** | [简体中文](../zh-CN/forter.md) | [日本語](../ja/forter.md) | [Português (Brasil)](../pt-BR/forter.md) | [Deutsch](../de/forter.md) | [Français](../fr/forter.md) | [한국어](../ko/forter.md)

# Анти-бот защита Forter: как определить, что сайт её использует (и что это значит для парсинга)

Forter - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Forter, хотите определить, использует ли сайт Forter, или разбираетесь с блокировкой парсинга со стороны Forter, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Forter. На этой странице перечислены 7 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Forter, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Forter - поставщик защиты от мошенничества в онлайн-торговле. Его скрипт снимает отпечаток браузера, а сайт отправляет полученный токен при принятии решений об оформлении заказа и входе.

Официальный сайт: [https://www.forter.com/](https://www.forter.com/)

## Как определить, что сайт использует Forter

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-forter` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^forterToken$` | 90% | forterToken cookie set by the Forter script |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://[0-9a-f]{12}\.cdn4\.forter\.com/sns?/[0-9a-f]{12}/(?:[^?#]*/)?script\.js(?:[?#]\|$)` | 100% | Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) |
| `^https://(?:[0-9a-f-]+\.)?cdn\d*\.forter\.com/(?:events\|[^?#]*\.json)(?:[?#]\|$)` | 100% | Forter collection request to a forter.com CDN host (prop.json, wpt.json, events) |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `\bftr__(?:startScriptLoad\|config)\b` | 20% (только для подтверждения) | Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `ftr__config (typeof object)` | 60% | ftr__config object set by the Forter loader snippet |
| `ftr__startScriptLoad (typeof number)` | 50% (только для подтверждения) | ftr__startScriptLoad timestamp set by the Forter loader snippet |
| `ftr__JSON3 (typeof object)` | 50% (только для подтверждения) | ftr__JSON3 object set by the Forter script |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Forter script with its token cookie or config | 100% | (Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) или Forter collection request to a forter.com CDN host (prop.json, wpt.json, events)) и (forterToken cookie set by the Forter script или ftr__config object set by the Forter loader snippet) |
| forterToken cookie with the Forter runtime | 100% | forterToken cookie set by the Forter script и (ftr__config object set by the Forter loader snippet или ftr__startScriptLoad timestamp set by the Forter loader snippet или ftr__JSON3 object set by the Forter script или Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config)) |
| Forter loader globals together | 85% | ftr__config object set by the Forter loader snippet и (ftr__startScriptLoad timestamp set by the Forter loader snippet или ftr__JSON3 object set by the Forter script) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Forter присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Forter, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Forter с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
