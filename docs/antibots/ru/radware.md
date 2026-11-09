[English](../radware.md) | [Español](../es/radware.md) | **Русский** | [简体中文](../zh-CN/radware.md) | [日本語](../ja/radware.md) | [Português (Brasil)](../pt-BR/radware.md) | [Deutsch](../de/radware.md) | [Français](../fr/radware.md) | [한국어](../ko/radware.md)

# Анти-бот защита Radware Bot Manager: как определить, что сайт её использует (и что это значит для парсинга)

Radware Bot Manager - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Radware Bot Manager, хотите определить, использует ли сайт Radware Bot Manager, или разбираетесь с блокировкой парсинга со стороны Radware Bot Manager, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Radware Bot Manager. На этой странице перечислены 10 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Radware Bot Manager, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Radware Bot Manager, ранее ShieldSquare, - продукт Radware для управления ботами. Radware также продаёт облачный WAF, и детектор ищет следы обоих.

Официальный сайт: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## Как определить, что сайт использует Radware Bot Manager

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-radware` (версия правила 2.2.0, последнее обновление 2026-10-16). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (только для подтверждения) | Radware Bot Manager cookies written by its JavaScript |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `CloudWebSec.radware.com` | 20% (только для подтверждения) | Script reference to the CloudWebSec vendor portal host |
| `Unauthorized Request Blocked` | 20% (только для подтверждения) | Script reference to the Radware block-page message |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | Script reference to the CloudWebSec vendor portal host и Script reference to the Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header и (Script reference to the CloudWebSec vendor portal host или Script reference to the Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header и Script reference to the CloudWebSec vendor portal host и Script reference to the Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) и First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) и First-party Radware Bot Manager script (stormcaster.js) и Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host и Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge и (Radware Bot Manager session cookies (__uzma … __uzmf) или Radware Bot Manager cookies written by its JavaScript) |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Radware Bot Manager присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Radware Bot Manager, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Radware Bot Manager с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
