[English](../akamai.md) | [Español](../es/akamai.md) | **Русский** | [简体中文](../zh-CN/akamai.md) | [日本語](../ja/akamai.md) | [Português (Brasil)](../pt-BR/akamai.md) | [Deutsch](../de/akamai.md) | [Français](../fr/akamai.md) | [한국어](../ko/akamai.md)

# Анти-бот защита Akamai Bot Manager: как определить, что сайт её использует (и что это значит для парсинга)

Akamai Bot Manager - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Akamai Bot Manager, хотите определить, использует ли сайт Akamai Bot Manager, или разбираетесь с блокировкой парсинга со стороны Akamai Bot Manager, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Akamai Bot Manager. На этой странице перечислены 19 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Akamai Bot Manager, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Akamai Bot Manager - это продукт для управления ботами компании Akamai Technologies, поставщика CDN и решений безопасности. Он продаётся крупным сайтам как часть периферийной платформы Akamai и призван отличать людей, добросовестных ботов и вредоносную автоматизацию.

Официальный сайт: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## Как определить, что сайт использует Akamai Bot Manager

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-akamai` (версия правила 2.2.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|sv\|s\|so\|lso)$` | 30% (только для подтверждения) | Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (только для подтверждения) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (только для подтверждения) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (только для подтверждения) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### Тела запросов и ответов

Данные, которые страница отправляет на подходящий адрес или получает с него.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape и (Bot Manager session cookie (hash~token) или Bot Manager edge session cookie или Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ или Bot Manager sensor object (bmak) или Bot Manager sensor_data POST body) и (Bot Manager sensor cookie in its documented hash~state~token shape или Bot Manager session cookie (hash~token) или Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script и Bot Manager sensor cookie in its documented hash~state~token shape и (Akamai edge server header; CDN delivery, not Bot Manager on its own или Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own или Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint или SBSD challenge POST to the sbsd endpoint) и SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own или Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) и (Bot Manager sensor cookie in its documented hash~state~token shape или Bot Manager session cookie (hash~token) или Bot Manager edge session cookie) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie и Other Bot Manager cookies (bm_mi, bm_sv, bm_s, bm_so); short names, corroboration only |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ и (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) или Bot Manager sensor cookie in its documented hash~state~token shape или Bot Manager session cookie (hash~token)) |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Akamai Bot Manager присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Akamai Bot Manager, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Akamai Bot Manager с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
