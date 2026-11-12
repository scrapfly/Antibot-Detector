[English](../bunny-shield.md) | [Español](../es/bunny-shield.md) | **Русский** | [简体中文](../zh-CN/bunny-shield.md) | [日本語](../ja/bunny-shield.md) | [Português (Brasil)](../pt-BR/bunny-shield.md) | [Deutsch](../de/bunny-shield.md) | [Français](../fr/bunny-shield.md) | [한국어](../ko/bunny-shield.md)

# Анти-бот защита Bunny Shield: как определить, что сайт её использует (и что это значит для парсинга)

Bunny Shield - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Bunny Shield, хотите определить, использует ли сайт Bunny Shield, или разбираетесь с блокировкой парсинга со стороны Bunny Shield, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Bunny Shield. На этой странице перечислены 5 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Bunny Shield, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Bunny Shield - продукт для защиты на периферии от CDN-компании bunny.net. Он добавляет к сайтам на bunny.net межсетевой экран веб-приложений, ограничение частоты запросов и обнаружение ботов и может попросить браузер решить JavaScript-задачу proof-of-work.

Официальный сайт: [https://bunny.net/shield/](https://bunny.net/shield/)

## Как определить, что сайт использует Bunny Shield

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-bunny-shield` (версия правила 2.0.0, последнее обновление 2026-11-12). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^bunny_shield$` | 90% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) |
| `^bunny_shield_chk$` | 90% | bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| `^bunny_shield_id$` | 90% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) |
| `^bunny_shield_bd$` | 90% | bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^server$: ^BunnyCDN-[A-Z0-9]{2,6}-[0-9]{1,8}$` | 40% (только для подтверждения) | Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Proof-of-work cookie with its checksum | 100% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) и bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| Bot detection identifier and fingerprint cookies | 95% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) и bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |
| Bunny Shield cookie on a bunny.net edge response | 95% | (bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) или bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) или bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) или bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs)) и Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Bunny Shield присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Bunny Shield, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Bunny Shield с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
