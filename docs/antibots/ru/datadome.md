[English](../datadome.md) | [Español](../es/datadome.md) | **Русский** | [简体中文](../zh-CN/datadome.md) | [日本語](../ja/datadome.md) | [Português (Brasil)](../pt-BR/datadome.md) | [Deutsch](../de/datadome.md) | [Français](../fr/datadome.md) | [한국어](../ko/datadome.md)

# Анти-бот защита DataDome: как определить, что сайт её использует (и что это значит для парсинга)

DataDome - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода DataDome, хотите определить, использует ли сайт DataDome, или разбираетесь с блокировкой парсинга со стороны DataDome, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает DataDome. На этой странице перечислены 13 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту DataDome, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

DataDome - французский поставщик защиты от ботов и онлайн-мошенничества. Он оценивает запросы с помощью JavaScript-тега и серверных сигналов и может ответить проверкой или страницей блокировки.

Официальный сайт: [https://datadome.co/](https://datadome.co/)

## Как определить, что сайт использует DataDome

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-datadome` (версия правила 2.2.0, последнее обновление 2026-11-12). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (только для подтверждения) | DataDome block-type header on challenge responses |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:[a-z0-9-]+\.)+captcha-delivery\.com(?:[/?#:]\|$)` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (только для подтверждения) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (только для подтверждения) | DataDome block page bootstrap (var dd={'rt':...}) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |
| `ddoptions (typeof object)` | 60% | DataDome tag options object (window.ddoptions) |
| `displayDataDomeResponsePage (typeof function)` | 85% | DataDome response page function (window.displayDataDomeResponsePage) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint или DataDome JS key set by the integration snippet или Integration snippet setting window.ddjskey) и DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header или DataDome protection response header или Response served by DataDome itself (block or challenge page)) и DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only и (DataDome JS key set by the integration snippet или Integration snippet setting window.ddjskey или DataDome tag options object (window.ddoptions)) |
| DataDome block page | 95% | (DataDome block page bootstrap (var dd={'rt':...}) или DataDome response page function (window.displayDataDomeResponsePage)) и (DataDome client ID response header или DataDome block-type header on challenge responses или DataDome challenge or CAPTCHA delivery host или DataDome session cookie) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если DataDome присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые DataDome, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится DataDome с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
