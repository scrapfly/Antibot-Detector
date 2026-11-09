[English](../fingerprintjs.md) | [Español](../es/fingerprintjs.md) | **Русский** | [简体中文](../zh-CN/fingerprintjs.md) | [日本語](../ja/fingerprintjs.md) | [Português (Brasil)](../pt-BR/fingerprintjs.md) | [Deutsch](../de/fingerprintjs.md) | [Français](../fr/fingerprintjs.md) | [한국어](../ko/fingerprintjs.md)

# Анти-бот защита FingerprintJS: как определить, что сайт её использует (и что это значит для парсинга)

FingerprintJS - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода FingerprintJS, хотите определить, использует ли сайт FingerprintJS, или разбираетесь с блокировкой парсинга со стороны FingerprintJS, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает FingerprintJS. На этой странице перечислены 13 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту FingerprintJS, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

FingerprintJS - библиотека снятия отпечатков браузера, доступная в открытой версии и как коммерческий сервис Pro от Fingerprint. Её библиотека BotD - отдельный открытый инструмент для обнаружения ботов. Её наличие показывает, что сайт собирает данные об устройстве, но не обязательно, что он блокирует ботов.

Официальный сайт: [https://fingerprint.com/](https://fingerprint.com/)

## Как определить, что сайт использует FingerprintJS

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-fingerprintjs` (версия правила 2.3.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.){0,2}fpcdn\.io/v[34](?:[/?#]\|$)` | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host |
| `^https://openfpcdn\.io/fingerprintjs/v[0-9]+(?:[/?#]\|$)` | 100% | FingerprintJS open-source library on the vendor openfpcdn.io host |
| `^https://fpnpmcdn\.net/v[34]/[A-Za-z0-9]+/loader_v\d+\.\d+\.\d+\.js(?:[?#]\|$)` | 100% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net |
| `^https://(?:[a-z0-9-]+\.)?api\.fpjs\.(?:io\|sh\|pro)(?:[/?#]\|$)` | 100% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?ci=jsl?/[34]\.\d+\.\d+(?:[&#]\|$)` | 30% (только для подтверждения) | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter |
| `^https?://[^/?#]+/(?:[^?#]*/)?fp\.(?:esm\|umd\|cjs)(?:\.[A-Za-z0-9_-]{6,})?\.js(?:[?#]\|$)` | 50% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own |
| `^https://m1\.openfpcdn\.io/fingerprintjs/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | OSS npm package monitoring ping on the vendor m1.openfpcdn.io host |
| `^https?://[^/?#]+/fpjs/api(?:[/?#]\|$)` | 25% (только для подтверждения) | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS |
| `^https://openfpcdn\.io/botd/v[0-9]+(?:[/?#]\|$)` | 100% | BotD bot detection library on the vendor openfpcdn.io host (botd/v1, botd/v2) |
| `^https://m1\.openfpcdn\.io/botd/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | BotD npm package monitoring ping on the vendor m1.openfpcdn.io host |

### Содержимое страницы и скриптов

Текст, найденный внутри страницы или её скриптов.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `FingerprintJS` | 10% | Script reference to the FingerprintJS agent global |

### Глобальные переменные JavaScript (window)

Свойства, которые собственный JavaScript-контекст страницы открывает в `window`.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `FingerprintJS (typeof object)` | 45% | FingerprintJS agent global object |
| `__fpjs_pvid (typeof string)` | 40% | Page-visit id the FingerprintJS Pro agent stores on window |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Pro agent loader with the agent global | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host и FingerprintJS agent global object |
| Open-source library with the agent global | 75% | FingerprintJS open-source library on the vendor openfpcdn.io host и FingerprintJS agent global object |
| First-party proxy endpoint with agent evidence | 85% | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS и (FingerprintJS agent global object или Script reference to the FingerprintJS agent global или Page-visit id the FingerprintJS Pro agent stores on window) |
| Bundled npm library with agent evidence | 75% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own и (FingerprintJS agent global object или Script reference to the FingerprintJS agent global или OSS npm package monitoring ping on the vendor m1.openfpcdn.io host) |
| Pro agent calling the vendor API with agent evidence | 85% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) и (FingerprintJS agent global object или Script reference to the FingerprintJS agent global или Page-visit id the FingerprintJS Pro agent stores on window) |
| npm Pro loader with calls to the vendor API | 85% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net и FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| CDN Pro loader with the agent's page-visit id | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host и Page-visit id the FingerprintJS Pro agent stores on window |
| First-party proxied Pro agent with its page-visit id | 80% | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter и Page-visit id the FingerprintJS Pro agent stores on window |
| Pro agent loader, agent global and script reference | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host и FingerprintJS agent global object и Script reference to the FingerprintJS agent global |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если FingerprintJS присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые FingerprintJS, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится FingerprintJS с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
