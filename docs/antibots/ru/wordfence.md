[English](../wordfence.md) | [Español](../es/wordfence.md) | **Русский** | [简体中文](../zh-CN/wordfence.md) | [日本語](../ja/wordfence.md) | [Português (Brasil)](../pt-BR/wordfence.md) | [Deutsch](../de/wordfence.md) | [Français](../fr/wordfence.md) | [한국어](../ko/wordfence.md)

# Анти-бот защита Wordfence: как определить, что сайт её использует (и что это значит для парсинга)

Wordfence - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Wordfence, хотите определить, использует ли сайт Wordfence, или разбираетесь с блокировкой парсинга со стороны Wordfence, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Wordfence. На этой странице перечислены 19 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Wordfence, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Wordfence - популярный плагин безопасности для WordPress. Он добавляет межсетевой экран, ограничение частоты запросов и защиту входа для отдельного сайта на WordPress.

Официальный сайт: [https://www.wordfence.com/](https://www.wordfence.com/)

## Как определить, что сайт использует Wordfence

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-wordfence` (версия правила 2.0.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^wfwaf-authcookie-[0-9a-f]{32}$` | 60% | Wordfence firewall cookie wfwaf-authcookie-<hash> set for logged-in users |
| `^wf_loginalerted_[0-9a-f]{64}$` | 60% | Wordfence new-device login alert cookie wf_loginalerted_<hash> |
| `^wfls-remembered-[A-Za-z0-9_-]{20,24}$` | 60% | Wordfence Login Security cookie wfls-remembered-<id> for a device that passed 2FA |
| `^wfCBLBypass$ = ^[0-9a-f]{13}$` | 60% | Wordfence country blocking bypass cookie wfCBLBypass |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence(?:-login-security)?/(?:modules/login-security/)?js/(?:login\|wflsi18n)\.\d+(?:\.min)?\.js(?:[?#]\|$)` | 90% | Wordfence Login Security login script or its translations |
| `^https?://[^/?#]+/(?:[^?#]*/)?wp-content/plugins/wordfence/(?:js\|css)/[\w.-]+\.(?:js\|css)(?:[?#]\|$)` | 80% | Script or stylesheet from the Wordfence plugin's own js or css folder |
| `^https?://[^/?#]+/(?:[^?#]*/)?\?wordfence_lh=1&hid=` | 50% | Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `WFLSVars` | 30% | Script defining WFLSVars, the Wordfence Login Security settings |
| `WFAJAXWatcherVars` | 30% | Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings |
| `wfLogHumanRan` | 20% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) |
| `_wfsf=unlockEmail` | 20% | Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) |
| `user-reports.wordfence` | 20% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `WFLSVars (typeof object)` | 60% | Wordfence Login Security settings object |
| `WFLSVars.useCAPTCHA (truthy)` | 60% | Wordfence Login Security reCAPTCHA turned on |
| `wordfenceAJAXWatcher (typeof object)` | 60% | Wordfence firewall watcher object |

### Элементы DOM

Элементы, найденные по CSS-селектору.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `a[href="https://www.wordfence.com/help/?query=locked-out"]` | 30% (только для подтверждения) | Locked-out documentation link on the Wordfence block page |
| `input#unlock-email` | 20% (только для подтверждения) | Unlock email field on the Wordfence block page |
| `input[name="wfwaf-false-positive-verified"]` | 50% | Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins |
| `a#reportButton` | 10% (только для подтверждения) | Report Problem button on the Wordfence blocklist page |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Login Security script with its settings | 100% | Wordfence Login Security login script or its translations и (Wordfence Login Security settings object или Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security with reCAPTCHA turned on | 100% | Wordfence Login Security reCAPTCHA turned on и (Wordfence Login Security login script or its translations или Script defining WFLSVars, the Wordfence Login Security settings) |
| Login Security settings in a script and at runtime | 90% | Script defining WFLSVars, the Wordfence Login Security settings и Wordfence Login Security settings object |
| Live Traffic script and its report request | 85% | Wordfence Live Traffic script that reports human visitors (wfLogHumanRan) и Wordfence Live Traffic request that reports a human visitor (wordfence_lh) |
| Firewall watcher script with its settings | 90% | Script or stylesheet from the Wordfence plugin's own js or css folder и (Wordfence firewall watcher object или Script defining WFAJAXWatcherVars, the Wordfence firewall watcher settings) |
| Wordfence block page help link with its unlock form or allowlist field | 85% | Locked-out documentation link on the Wordfence block page и (Unlock-by-email script of the Wordfence block page (_wfsf=unlockEmail) или Unlock email field on the Wordfence block page или Checkbox wfwaf-false-positive-verified on the Wordfence firewall block page shown to admins) |
| Wordfence blocklist page report script and button | 80% | Report-a-problem script of the Wordfence blocklist page (user-reports.wordfence) и Report Problem button on the Wordfence blocklist page |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Wordfence присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Wordfence, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Wordfence с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
