[English](../amazon.md) | [Español](../es/amazon.md) | **Русский** | [简体中文](../zh-CN/amazon.md) | [日本語](../ja/amazon.md) | [Português (Brasil)](../pt-BR/amazon.md) | [Deutsch](../de/amazon.md) | [Français](../fr/amazon.md) | [한국어](../ko/amazon.md)

# Анти-бот защита Amazon Bot Protection: как определить, что сайт её использует (и что это значит для парсинга)

Amazon Bot Protection - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Amazon Bot Protection, хотите определить, использует ли сайт Amazon Bot Protection, или разбираетесь с блокировкой парсинга со стороны Amazon Bot Protection, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Amazon Bot Protection. На этой странице перечислены 3 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Amazon Bot Protection, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Страницы входа Amazon собирают клиентский отпечаток браузера, который форма входа отправляет вместе с учётными данными. Это часть собственных средств защиты Amazon от злоупотреблений, а не продукт, доступный другим сайтам.

Официальный сайт: [https://www.amazon.com/](https://www.amazon.com/)

## Как определить, что сайт использует Amazon Bot Protection

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-amazon` (версия правила 2.1.1, последнее обновление 2026-11-04). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `fwcimCmd` | 30% (только для подтверждения) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (только для подтверждения) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint и FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint и Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages и Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## Сложность

**Высокая.** Высокая сложность означает, что расширение относит эту защиту к числу самых трудных для обхода: как правило, она сочетает проверки на стороне клиента с поведенческой или серверной оценкой.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Amazon Bot Protection присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Amazon Bot Protection, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Amazon Bot Protection с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
