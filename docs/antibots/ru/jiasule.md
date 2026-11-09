[English](../jiasule.md) | [Español](../es/jiasule.md) | **Русский** | [简体中文](../zh-CN/jiasule.md) | [日本語](../ja/jiasule.md) | [Português (Brasil)](../pt-BR/jiasule.md) | [Deutsch](../de/jiasule.md) | [Français](../fr/jiasule.md) | [한국어](../ko/jiasule.md)

# Анти-бот защита Jiasule (Chuangyu Shield): как определить, что сайт её использует (и что это значит для парсинга)

Jiasule (Chuangyu Shield) - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Jiasule (Chuangyu Shield), хотите определить, использует ли сайт Jiasule (Chuangyu Shield), или разбираетесь с блокировкой парсинга со стороны Jiasule (Chuangyu Shield), первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Jiasule (Chuangyu Shield). На этой странице перечислены 7 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Jiasule (Chuangyu Shield), насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Jiasule, также пишется Chuangyu Shield, - китайский сервис защиты от DDoS и веб-защиты от Knownsec. Он часто показывает JavaScript-шлюз до загрузки страницы.

Официальный сайт: [https://www.jiasule.com/](https://www.jiasule.com/)

## Как определить, что сайт использует Jiasule (Chuangyu Shield)

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-jiasule` (версия правила 2.2.0, последнее обновление 2026-10-16). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (только для подтверждения) | Jiasule tracking cookie set alongside the challenge cookies |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie и Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response или Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) и (Jiasule visitor id cookie set on first request или Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response и Jiasule visitor id cookie set on first request и Jiasule JavaScript-challenge clearance cookie |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Jiasule (Chuangyu Shield) присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Jiasule (Chuangyu Shield), не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Jiasule (Chuangyu Shield) с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
