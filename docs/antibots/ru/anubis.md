[English](../anubis.md) | [Español](../es/anubis.md) | **Русский** | [简体中文](../zh-CN/anubis.md) | [日本語](../ja/anubis.md) | [Português (Brasil)](../pt-BR/anubis.md) | [Deutsch](../de/anubis.md) | [Français](../fr/anubis.md) | [한국어](../ko/anubis.md)

# Анти-бот защита Anubis: как определить, что сайт её использует (и что это значит для парсинга)

Anubis - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Anubis, хотите определить, использует ли сайт Anubis, или разбираетесь с блокировкой парсинга со стороны Anubis, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Anubis. На этой странице перечислены 6 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Anubis, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Anubis - это открытый веб-шлюз от Techaro, который просит браузер каждого нового посетителя решить небольшую задачу proof-of-work до загрузки страницы. Он создан, чтобы замедлять ИИ-краулеры, и используется на многих открытых и сообщественных сайтах.

Официальный сайт: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## Как определить, что сайт использует Anubis

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-anubis` (версия правила 2.1.1, последнее обновление 2026-10-30). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (только для подтверждения) | Proof-of-work progress bar inner element on the challenge page |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint и (Anubis mascot image (pensive/happy/reject) loaded from the command endpoint или Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) или Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix)) и Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) и Anubis main challenge module loaded from the command endpoint и Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Anubis присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Anubis, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Anubis с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
