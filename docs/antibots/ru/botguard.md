[English](../botguard.md) | [Español](../es/botguard.md) | **Русский** | [简体中文](../zh-CN/botguard.md) | [日本語](../ja/botguard.md) | [Português (Brasil)](../pt-BR/botguard.md) | [Deutsch](../de/botguard.md) | [Français](../fr/botguard.md) | [한국어](../ko/botguard.md)

# Анти-бот защита Google BotGuard: как определить, что сайт её использует (и что это значит для парсинга)

Google BotGuard - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Google BotGuard, хотите определить, использует ли сайт Google BotGuard, или разбираетесь с блокировкой парсинга со стороны Google BotGuard, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Google BotGuard. На этой странице перечислены 7 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Google BotGuard, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

BotGuard - это собственная клиентская технология Google для проверки целостности и обнаружения ботов. Её используют сервисы Google и reCAPTCHA, а принцип её работы Google не публикует.

Официальный сайт: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## Как определить, что сайт использует Google BotGuard

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-botguard` (версия правила 2.3.0, последнее обновление 2026-10-17). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (только для подтверждения) | BotGuard interpreter URL key |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `trayride (exists)` | 50% (только для подтверждения) | BotGuard VM global (globalName from bgChallenge) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) или BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) и (Web Anti-Abuse (BotGuard) attestation RPC или Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) или BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) и (BotGuard challenge config key in page data или BotGuard interpreter URL key или BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC или Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) и (BotGuard VM global (globalName from bgChallenge) или BotGuard challenge config key in page data) |

## Сложность

**Высокая.** Высокая сложность означает, что расширение относит эту защиту к числу самых трудных для обхода: как правило, она сочетает проверки на стороне клиента с поведенческой или серверной оценкой.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Google BotGuard присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Google BotGuard, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Google BotGuard с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
