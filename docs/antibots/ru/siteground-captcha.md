[English](../siteground-captcha.md) | [Español](../es/siteground-captcha.md) | **Русский** | [简体中文](../zh-CN/siteground-captcha.md) | [日本語](../ja/siteground-captcha.md) | [Português (Brasil)](../pt-BR/siteground-captcha.md) | [Deutsch](../de/siteground-captcha.md) | [Français](../fr/siteground-captcha.md) | [한국어](../ko/siteground-captcha.md)

# Анти-бот защита SiteGround SG-CAPTCHA: как определить, что сайт её использует (и что это значит для парсинга)

SiteGround SG-CAPTCHA - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода SiteGround SG-CAPTCHA, хотите определить, использует ли сайт SiteGround SG-CAPTCHA, или разбираетесь с блокировкой парсинга со стороны SiteGround SG-CAPTCHA, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает SiteGround SG-CAPTCHA. На этой странице перечислены 3 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту SiteGround SG-CAPTCHA, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

SG-CAPTCHA - анти-бот проверка, используемая хостингом SiteGround. Посетители, похожие на автоматизированных, направляются на страницу проверки, которую нужно пройти до загрузки сайта.

Официальный сайт: [https://www.siteground.com/blog/new-anti-bot-ai/](https://www.siteground.com/blog/new-anti-bot-ai/)

## Как определить, что сайт использует SiteGround SG-CAPTCHA

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-siteground-captcha` (версия правила 2.0.0, последнее обновление 2026-11-05). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^sg-captcha$: ^challenge$` | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/sgcaptcha/(?:[?#]\|$)` | 100% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `\bsg(?:challenge\|submit_url)\b` | 30% | SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| sg-captcha header on the SG-CAPTCHA challenge page | 100% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge и SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ |
| sg-captcha header with the challenge constants in the page's scripts | 95% | sg-captcha: challenge, SiteGround's Anti-Bot AI served its challenge и SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |
| SG-CAPTCHA challenge page with its constants in the page's scripts | 90% | SG-CAPTCHA challenge page and answer endpoint under /.well-known/sgcaptcha/ и SG-CAPTCHA challenge constants (sgchallenge, sgsubmit_url) in the page's scripts |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если SiteGround SG-CAPTCHA присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые SiteGround SG-CAPTCHA, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится SiteGround SG-CAPTCHA с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
