[English](../edgeone.md) | [Español](../es/edgeone.md) | **Русский** | [简体中文](../zh-CN/edgeone.md) | [日本語](../ja/edgeone.md) | [Português (Brasil)](../pt-BR/edgeone.md) | [Deutsch](../de/edgeone.md) | [Français](../fr/edgeone.md) | [한국어](../ko/edgeone.md)

# Анти-бот защита Tencent Cloud EdgeOne: как определить, что сайт её использует (и что это значит для парсинга)

Tencent Cloud EdgeOne - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Tencent Cloud EdgeOne, хотите определить, использует ли сайт Tencent Cloud EdgeOne, или разбираетесь с блокировкой парсинга со стороны Tencent Cloud EdgeOne, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Tencent Cloud EdgeOne. На этой странице перечислены 8 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Tencent Cloud EdgeOne, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Tencent Cloud EdgeOne - платформа ускорения и защиты на периферии сети от Tencent Cloud. Помимо доставки контента, она предлагает WAF и управление ботами, которое может выдавать JavaScript-проверки и проверять клиентов с помощью SDK аттестации.

Официальный сайт: [https://edgeone.ai/](https://edgeone.ai/)

## Как определить, что сайт использует Tencent Cloud EdgeOne

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-edgeone` (версия правила 2.0.0, последнее обновление 2026-11-12). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^EO-Bot-SessionId$` | 90% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) |
| `^EO-Bot-Token$` | 90% | EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| `^EO_Bot_Ssid$` | 60% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^eo-log-uuid$: ^[0-9]{10,24}$` | 40% (только для подтверждения) | EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection |
| `^server$: ^TencentEdgeOne$` | 40% (только для подтверждения) | Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://cdnstatic\.tencentcs\.com/edgeone/security/client-attestation/eoclientsecuritykit(?:\.min)?\.js(?:[?#]\|$)` | 100% | EdgeOne client attestation SDK eoclientsecuritykit.min.js on Tencent's CDN (EdgeOne docs) |
| `^https?://[^/?#]+/\.eo-sec-bot/` | 100% | Request to /.eo-sec-bot/ on the site, which the EdgeOne attestation SDK calls to start (EdgeOne docs) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `EOClientSecurityKit (typeof object)` | 75% | EOClientSecurityKit object of the EdgeOne client attestation SDK |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Bot session cookie and client verification token | 100% | EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) и EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs) |
| Bot management cookie on an EdgeOne response | 95% | (EO-Bot-SessionId bot management session cookie that EdgeOne counts requests by (EdgeOne docs) или EO-Bot-Token client verification cookie of EdgeOne bot management (EdgeOne docs)) и (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection или Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| JavaScript challenge cookie on an EdgeOne response | 90% | EO_Bot_Ssid cookie that the EdgeOne JavaScript challenge sets, seen on EdgeOne sites but not named in its docs и (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection или Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |
| Attestation SDK object on an EdgeOne response | 90% | EOClientSecurityKit object of the EdgeOne client attestation SDK и (EO-LOG-UUID request ID header that EdgeOne adds to every response; proves the CDN, not protection или Server header TencentEdgeOne that EdgeOne adds when the origin sends none; proves the CDN, not protection) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Tencent Cloud EdgeOne присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Tencent Cloud EdgeOne, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Tencent Cloud EdgeOne с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
