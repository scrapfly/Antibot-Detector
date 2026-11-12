[English](../perimeterx.md) | [Español](../es/perimeterx.md) | **Русский** | [简体中文](../zh-CN/perimeterx.md) | [日本語](../ja/perimeterx.md) | [Português (Brasil)](../pt-BR/perimeterx.md) | [Deutsch](../de/perimeterx.md) | [Français](../fr/perimeterx.md) | [한국어](../ko/perimeterx.md)

# Анти-бот защита HUMAN (PerimeterX): как определить, что сайт её использует (и что это значит для парсинга)

HUMAN (PerimeterX) - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода HUMAN (PerimeterX), хотите определить, использует ли сайт HUMAN (PerimeterX), или разбираетесь с блокировкой парсинга со стороны HUMAN (PerimeterX), первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает HUMAN (PerimeterX). На этой странице перечислены 22 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту HUMAN (PerimeterX), насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

PerimeterX теперь входит в HUMAN Security. Его bot defender размещает на странице скрипт и оценивает посетителей по поведению и сигналам устройства, а также может ответить проверкой в стиле "нажмите и удерживайте".

Официальный сайт: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## Как определить, что сайт использует HUMAN (PerimeterX)

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-perimeterx` (версия правила 2.4.0, последнее обновление 2026-11-12). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (только для подтверждения) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| `^(?:_pxmvid\|_pxttld\|_pxwvm\|_pxmd\|_pxda\|_pxac)$` | 60% | Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac) |
| `^__pxvid$` | 60% | HUMAN Code Defender visitor cookie (__pxvid) |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (только для подтверждения) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |
| `^https://(?:[a-z0-9-]+\.)+(?:px-cloud\.net\|px-cdn\.net\|px-client\.net\|pxchk\.net\|perimeterx\.net\|hsprotect\.net)(?:[/?#:]\|$)` | 100% | Request to a HUMAN (PerimeterX) sensor, collector or challenge host |
| `^https?://[^/?#]+/(?:PX)?[A-Za-z0-9]{8}/xhr/api/v[0-9]/collector(?:[/?#]\|$)` | 85% | First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector) |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/init\.js(?:[?#]\|$)` | 30% (только для подтверждения) | First-party init.js under an app-ID path without the PX prefix; corroboration only |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (только для подтверждения) | Optional PerimeterX init callback defined by the site |
| `_pxUuid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxVid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxBlockedUrl (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxJsClientSrc (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `div#px-captcha` | 60% | HUMAN challenge container (div#px-captcha) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID или First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) или PerimeterX application ID или PerimeterX collector endpoint) и (PerimeterX risk token cookie (_px2 or _px3) или PerimeterX first-party server cookie или PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | не менее 2 из: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host и (PerimeterX application ID или Script assigning the PerimeterX app ID (window._pxAppId) или Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) и (PerimeterX application ID или Script assigning the PerimeterX app ID (window._pxAppId) или Optional PerimeterX init callback defined by the site) |
| First-party HUMAN sensor with its app ID or cookies | 95% | (First-party init.js under an app-ID path without the PX prefix; corroboration only или First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector)) и (PerimeterX application ID или Script assigning the PerimeterX app ID (window._pxAppId) или Optional PerimeterX init callback defined by the site или Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) или Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac)) |
| HUMAN block page with its challenge | 95% | (HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) или HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) или HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) или HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) или HUMAN challenge container (div#px-captcha)) и (PerimeterX challenge (Press & Hold) script host или First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) или Request to a HUMAN (PerimeterX) sensor, collector or challenge host) |

## Сложность

**Высокая.** Высокая сложность означает, что расширение относит эту защиту к числу самых трудных для обхода: как правило, она сочетает проверки на стороне клиента с поведенческой или серверной оценкой.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если HUMAN (PerimeterX) присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые HUMAN (PerimeterX), не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится HUMAN (PerimeterX) с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
