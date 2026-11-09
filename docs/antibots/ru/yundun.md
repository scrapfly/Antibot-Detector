[English](../yundun.md) | [Español](../es/yundun.md) | **Русский** | [简体中文](../zh-CN/yundun.md) | [日本語](../ja/yundun.md) | [Português (Brasil)](../pt-BR/yundun.md) | [Deutsch](../de/yundun.md) | [Français](../fr/yundun.md) | [한국어](../ko/yundun.md)

# Анти-бот защита Yundun Cloud WAF: как определить, что сайт её использует (и что это значит для парсинга)

Yundun Cloud WAF - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Yundun Cloud WAF, хотите определить, использует ли сайт Yundun Cloud WAF, или разбираетесь с блокировкой парсинга со стороны Yundun Cloud WAF, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Yundun Cloud WAF. На этой странице перечислены 11 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Yundun Cloud WAF, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Yundun - китайский поставщик облачной безопасности, предлагающий облачный WAF и защиту от DDoS. Его проверки часто встречаются на китайских сайтах.

Официальный сайт: [https://www.yundun.com/](https://www.yundun.com/)

## Как определить, что сайт использует Yundun Cloud WAF

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-yundun` (версия правила 2.0.2, последнее обновление 2026-10-29). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Cookie

Имена cookie (и значения, если проверяется значение), установленные на странице. Шаблоны являются регулярными выражениями, если это не простые слова.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (только для подтверждения) | Yundun WAF session cookie |

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (только для подтверждения) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (только для подтверждения) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (только для подтверждения) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges) и Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie и (Server header carrying the Yundun edge signature (legacy edges) или Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges) и Cache header carrying the Yundun edge signature (legacy edges) и Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge и X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) и Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) или First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)) и (Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) или Yundun WAF captcha marker cookie или Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) и Yundun WAF captcha marker cookie и Server: WAF sent by the current Yundun edge |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Yundun Cloud WAF присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Yundun Cloud WAF, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Yundun Cloud WAF с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
