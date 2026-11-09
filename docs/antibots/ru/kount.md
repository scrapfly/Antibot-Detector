[English](../kount.md) | [Español](../es/kount.md) | **Русский** | [简体中文](../zh-CN/kount.md) | [日本語](../ja/kount.md) | [Português (Brasil)](../pt-BR/kount.md) | [Deutsch](../de/kount.md) | [Français](../fr/kount.md) | [한국어](../ko/kount.md)

# Анти-бот защита Kount: как определить, что сайт её использует (и что это значит для парсинга)

Kount - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Kount, хотите определить, использует ли сайт Kount, или разбираетесь с блокировкой парсинга со стороны Kount, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Kount. На этой странице перечислены 4 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Kount, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Kount, часть Equifax, - компания по защите от платёжного мошенничества. Его Device Data Collector собирает сведения о браузере, которые серверная часть продавца отправляет в Kount для оценки риска.

Официальный сайт: [https://kount.com/](https://kount.com/)

## Как определить, что сайт использует Kount

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-kount` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://(?:ssl\|tst)\.kaptcha\.com/collect/sdk\?(?:[^#]*&)?m=[0-9]{3,}(?:[&#]\|$)` | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) |
| `^https://(?:ssl\|tst)\.kaptcha\.com/(?:cs/(?:config\|generatecookie\|storecookie\|location)\|session/[A-Za-z0-9_-]+\|logo\.htm\|fin)(?:[?#]\|$)` | 100% | Kount Web SDK request to the vendor kaptcha.com collector |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `kaxsdc` | 20% | Script reference to the kaxsdc class that triggers Kount data collection |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `ka.ClientSDK (typeof function)` | 60% | ka.ClientSDK class of the Kount data collector |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Kount collector script with its class or trigger | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) и (ka.ClientSDK class of the Kount data collector или Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount collector request with its script or class | 95% | Kount Web SDK request to the vendor kaptcha.com collector и (Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) или ka.ClientSDK class of the Kount data collector или Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount class with its trigger | 80% | ka.ClientSDK class of the Kount data collector и Script reference to the kaxsdc class that triggers Kount data collection |

## Сложность

**Средняя.** Средняя сложность означает, что расширение считает эту защиту серьёзным препятствием: ожидайте проверок браузера, деталей запроса или и того и другого, причём со временем они меняются.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Kount присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Kount, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Kount с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
