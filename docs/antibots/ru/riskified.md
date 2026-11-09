[English](../riskified.md) | [Español](../es/riskified.md) | **Русский** | [简体中文](../zh-CN/riskified.md) | [日本語](../ja/riskified.md) | [Português (Brasil)](../pt-BR/riskified.md) | [Deutsch](../de/riskified.md) | [Français](../fr/riskified.md) | [한국어](../ko/riskified.md)

# Анти-бот защита Riskified: как определить, что сайт её использует (и что это значит для парсинга)

Riskified - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Riskified, хотите определить, использует ли сайт Riskified, или разбираетесь с блокировкой парсинга со стороны Riskified, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Riskified. На этой странице перечислены 4 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Riskified, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Riskified - компания по защите от мошенничества в электронной коммерции. Скрипт на страницах магазинов отправляет данные о браузере и сессии, которые помогают принимать решения о платежах и злоупотреблении аккаунтами.

Официальный сайт: [https://www.riskified.com/](https://www.riskified.com/)

## Как определить, что сайт использует Riskified

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-riskified` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://beacon\.riskified\.com/?\?(?:[^#]*&)?shop=[^&#]+` | 100% | Riskified beacon script from the vendor beacon.riskified.com host (shop=<store>&sid=<session>) |
| `^https://(?:c\.riskified\.com/e\.gif\|img\.riskified\.com/img/)` | 100% | Riskified beacon request to its c.riskified.com or img.riskified.com collector |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `RISKX.go (typeof function)` | 60% | RISKX.go function of the Riskified beacon |
| `RISKX.setSid (typeof function)` | 40% (только для подтверждения) | RISKX.setSid session helper of the Riskified beacon |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Riskified beacon with its global or collector | 100% | Riskified beacon script from the vendor beacon.riskified.com host (shop=<store>&sid=<session>) и (RISKX.go function of the Riskified beacon или RISKX.setSid session helper of the Riskified beacon или Riskified beacon request to its c.riskified.com or img.riskified.com collector) |
| Riskified collector request with its global | 95% | Riskified beacon request to its c.riskified.com or img.riskified.com collector и (RISKX.go function of the Riskified beacon или RISKX.setSid session helper of the Riskified beacon) |
| Riskified global with its session helper | 80% | RISKX.go function of the Riskified beacon и RISKX.setSid session helper of the Riskified beacon |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Riskified присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Riskified, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Riskified с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
