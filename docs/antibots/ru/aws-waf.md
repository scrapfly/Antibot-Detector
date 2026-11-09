[English](../aws-waf.md) | [Español](../es/aws-waf.md) | **Русский** | [简体中文](../zh-CN/aws-waf.md) | [日本語](../ja/aws-waf.md) | [Português (Brasil)](../pt-BR/aws-waf.md) | [Deutsch](../de/aws-waf.md) | [Français](../fr/aws-waf.md) | [한국어](../ko/aws-waf.md)

# Анти-бот защита AWS WAF: как определить, что сайт её использует (и что это значит для парсинга)

AWS WAF - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода AWS WAF, хотите определить, использует ли сайт AWS WAF, или разбираетесь с блокировкой парсинга со стороны AWS WAF, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает AWS WAF. На этой странице перечислены 12 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту AWS WAF, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

AWS WAF - это межсетевой экран веб-приложений Amazon Web Services. Его функции Bot Control и проверок могут требовать от браузера выполнить JavaScript-проверку и сохранить токен, поэтому обычный HTTP-клиент может получить отказ.

Официальный сайт: [https://aws.amazon.com/waf/](https://aws.amazon.com/waf/)

## Как определить, что сайт использует AWS WAF

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-aws-waf` (версия правила 2.2.0, последнее обновление 2026-11-09). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^aws-waf-token$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9+/=_:-]{20,}` | 100% | AWS WAF token cookie set after a challenge |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-amzn-waf-action$: ^(?:challenge\|captcha)$` | 100% | AWS WAF challenge or captcha action header |
| `^x-amzn-waf-challenge-id$` | 40% (только для подтверждения) | AWS WAF challenge id header |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.token\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:challenge\|captcha\|jsapi)\.js(?:[?#]\|$)` | 100% | Integration SDK from the regional token.awswaf.com host |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.token\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:inputs\|verify\|telemetry\|voucher\|mp_verify)(?:[?#/]\|$)` | 100% | Any request to the regional token.awswaf.com host (inputs, verify, telemetry) |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.captcha\.awswaf\.com/` | 100% | AWS WAF CAPTCHA host |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `gokuProps` | 15% (только для подтверждения) | Challenge page bootstrap variable (window.gokuProps) |
| `AwsWafIntegration` | 10% | Integration SDK namespace reference |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `AwsWafIntegration (typeof object)` | 75% | AWS WAF Integration SDK object |
| `gokuProps (typeof object)` | 70% | Challenge page bootstrap object (gokuProps) |
| `AwsWafCaptcha (typeof object)` | 75% | AWS WAF Integration SDK object |
| `awsWafCookieDomainList (exists)` | 30% (только для подтверждения) | Token cookie domain list for the Integration SDK |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Challenge response with its bootstrap | 100% | (AWS WAF challenge or captcha action header или AWS WAF challenge id header) и (Challenge page bootstrap object (gokuProps) или Challenge page bootstrap variable (window.gokuProps) или Integration SDK from the regional token.awswaf.com host) |
| Integration SDK with token traffic or cookie | 100% | (Integration SDK from the regional token.awswaf.com host или AWS WAF Integration SDK object) и (AWS WAF token cookie set after a challenge или Any request to the regional token.awswaf.com host (inputs, verify, telemetry) или Token cookie domain list for the Integration SDK) |
| Token cookie with SDK reference | 90% | AWS WAF token cookie set after a challenge и (Integration SDK namespace reference или Challenge page bootstrap variable (window.gokuProps) или Token cookie domain list for the Integration SDK) |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если AWS WAF присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые AWS WAF, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится AWS WAF с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
