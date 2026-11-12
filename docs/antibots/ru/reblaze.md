[English](../reblaze.md) | [Español](../es/reblaze.md) | **Русский** | [简体中文](../zh-CN/reblaze.md) | [日本語](../ja/reblaze.md) | [Português (Brasil)](../pt-BR/reblaze.md) | [Deutsch](../de/reblaze.md) | [Français](../fr/reblaze.md) | [한국어](../ko/reblaze.md)

# Анти-бот защита Reblaze: как определить, что сайт её использует (и что это значит для парсинга)

Reblaze - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Reblaze, хотите определить, использует ли сайт Reblaze, или разбираетесь с блокировкой парсинга со стороны Reblaze, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Reblaze. На этой странице перечислены 8 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Reblaze, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Reblaze - облачная платформа веб-безопасности, включающая межсетевой экран веб-приложений, защиту от DDoS и управление ботами.

Официальный сайт: [https://www.reblaze.com/](https://www.reblaze.com/)

## Как определить, что сайт использует Reblaze

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-reblaze` (версия правила 2.2.0, последнее обновление 2026-11-12). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^rbzid$` | 80% | Reblaze visitor id cookie |
| `^rbzsessionid$` | 100% | Reblaze session cookie |
| `^rbz(?!id$\|sessionid$)[a-z0-9_]{2,20}$` | 30% (только для подтверждения) | Other rbz* cookies (not rbzid or rbzsessionid) |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9_-]{3,40}\.ac_v2\.lib\.js(?:[?#]\|$)` | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) |
| `^https?://[^/?#]+/c3650cdf-216a-4ba2-80b0-9d6c540b105e58d2670b-ea0f-484e-b88c-0e2c1499ec9bd71e4b42-8570-44e3-89b6-845326fa43b6(?:[?#]\|$)` | 100% | Reblaze passive challenge script at its fixed first-party path |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `rbzns` | 10% | Reblaze namespace in page scripts |
| `bereshit` | 20% (только для подтверждения) | Reblaze challenge config key (rbzns.bereshit) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `rbzns (typeof object)` | 75% | Reblaze namespace object (window.rbzns) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Challenge library with its namespace | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) и (Reblaze namespace object (window.rbzns) или Reblaze namespace in page scripts или Reblaze challenge config key (rbzns.bereshit)) |
| Reblaze cookies with its namespace or library | 90% | (Reblaze visitor id cookie или Reblaze session cookie или Other rbz* cookies (not rbzid or rbzsessionid)) и (Reblaze namespace object (window.rbzns) или Reblaze active-challenge library (<name>.ac_v2.lib.js) или Reblaze namespace in page scripts) |
| Reblaze id and session cookies | 85% | Reblaze visitor id cookie и (Reblaze session cookie или Other rbz* cookies (not rbzid or rbzsessionid)) |
| Reblaze namespace running with its challenge config | 90% | Reblaze namespace object (window.rbzns) и Reblaze challenge config key (rbzns.bereshit) |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Reblaze присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Reblaze, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Reblaze с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
