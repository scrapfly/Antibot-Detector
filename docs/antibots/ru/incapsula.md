[English](../incapsula.md) | [Español](../es/incapsula.md) | **Русский** | [简体中文](../zh-CN/incapsula.md) | [日本語](../ja/incapsula.md) | [Português (Brasil)](../pt-BR/incapsula.md) | [Deutsch](../de/incapsula.md) | [Français](../fr/incapsula.md) | [한국어](../ko/incapsula.md)

# Анти-бот защита Incapsula (Imperva): как определить, что сайт её использует (и что это значит для парсинга)

Incapsula (Imperva) - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Incapsula (Imperva), хотите определить, использует ли сайт Incapsula (Imperva), или разбираетесь с блокировкой парсинга со стороны Incapsula (Imperva), первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Incapsula (Imperva). На этой странице перечислены 10 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Incapsula (Imperva), насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Incapsula - прежнее название облачного межсетевого экрана веб-приложений и CDN Imperva. Он сочетает правила WAF с защитой от ботов, и его часто узнают по cookie.

Официальный сайт: [https://www.imperva.com/products/web-application-firewall-waf/](https://www.imperva.com/products/web-application-firewall-waf/)

## Как определить, что сайт использует Incapsula (Imperva)

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-incapsula` (версия правила 2.1.0, последнее обновление 2026-10-16). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^incap_ses_[0-9]+_[0-9]+$` | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) |
| `^visid_incap_[0-9]+$` | 100% | Incapsula visitor ID cookie (visid_incap_<site>) |
| `^nlbi_[0-9]+(?:_[0-9]+)?$` | 60% | Incapsula load balancer cookie (nlbi_<site>) |
| `^reese84$` | 100% | Imperva Advanced Bot Protection token cookie |
| `^___utmvc$` | 100% | Incapsula JavaScript challenge cookie (___utmvc) |
| `^_impv_routing$` | 40% (только для подтверждения) | Imperva edge routing cookie (seen with incap_ses_ / visid_incap_) |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-iinfo$` | 100% | Incapsula request info response header |
| `^x-cdn$: ^(?:Imperva\|Incapsula)$` | 100% | Imperva CDN response header |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/_Incapsula_Resource\?` | 100% | Incapsula challenge resource endpoint |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `_Incapsula_Resource` | 20% | Script reference to _Incapsula_Resource or the incident page |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Incapsula session and visitor cookies | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) и (Incapsula visitor ID cookie (visid_incap_<site>) или Incapsula load balancer cookie (nlbi_<site>) или Imperva edge routing cookie (seen with incap_ses_ / visid_incap_)) |
| Imperva edge header with an Incapsula cookie | 100% | (Incapsula request info response header или Imperva CDN response header) и (Incapsula session cookie (incap_ses_<proxy>_<site>) или Incapsula visitor ID cookie (visid_incap_<site>) или Incapsula load balancer cookie (nlbi_<site>) или Imperva Advanced Bot Protection token cookie) |
| Incapsula challenge resource with a challenge cookie | 90% | Incapsula challenge resource endpoint и (Incapsula JavaScript challenge cookie (___utmvc) или Imperva Advanced Bot Protection token cookie или Incapsula session cookie (incap_ses_<proxy>_<site>)) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Incapsula (Imperva) присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Incapsula (Imperva), не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Incapsula (Imperva) с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
