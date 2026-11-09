[English](../azurefrontdoor.md) | [Español](../es/azurefrontdoor.md) | **Русский** | [简体中文](../zh-CN/azurefrontdoor.md) | [日本語](../ja/azurefrontdoor.md) | [Português (Brasil)](../pt-BR/azurefrontdoor.md) | [Deutsch](../de/azurefrontdoor.md) | [Français](../fr/azurefrontdoor.md) | [한국어](../ko/azurefrontdoor.md)

# Анти-бот защита Azure Front Door: как определить, что сайт её использует (и что это значит для парсинга)

Azure Front Door - это система защиты от ботов или от злоупотреблений, которую некоторые сайты ставят перед своими страницами. Если вы ищете способ обхода Azure Front Door, хотите определить, использует ли сайт Azure Front Door, или разбираетесь с блокировкой парсинга со стороны Azure Front Door, первый шаг один и тот же: убедиться, что на ваши запросы действительно отвечает Azure Front Door. На этой странице перечислены 4 публичных признаков, по которым расширение Scrapfly Antibot Detector распознаёт анти-бот защиту Azure Front Door, насколько уверенно каждый из них на неё указывает и что это обычно означает для автоматизированного клиента.

## Что это такое

Azure Front Door - это глобальная сеть доставки контента и приложений Microsoft для Azure. Её можно сочетать с межсетевым экраном веб-приложений Azure, поэтому её присутствие говорит о периферийном слое перед сайтом, но не всегда о фильтрации ботов.

Официальный сайт: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## Как определить, что сайт использует Azure Front Door

Эти признаки сформированы из собственных правил обнаружения расширения для `detect-azurefrontdoor` (версия правила 2.1.0, последнее обновление 2026-10-26). Признак - лишь индикатор: уверенность показывает, насколько расширение убеждено в результате при срабатывании именно этого признака. Признаки с пометкой "только для подтверждения" никогда не учитываются сами по себе, потому что их могут создавать и другие продукты.

### Заголовки ответа

HTTP-заголовки ответа, которые возвращают страница или её запросы.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (только для подтверждения) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### URL скриптов и запросов

Адреса скриптов, фреймов и запросов, которые загружает страница. Это шаблоны, сопоставляемые с полным адресом.

| Признак | Уверенность | На что указывает |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### Комбинации

Некоторые признаки вместе дают более высокую оценку, чем по отдельности. Расширение сообщает и об этих комбинациях.

| Комбинация | Уверенность | Что требуется |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response и Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response и Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host и (Azure Front Door request reference header on every edge response или Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response и Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) и Resource served from an azurefd.net Front Door endpoint host |

## Сложность

**Низкая.** Низкая сложность означает, что расширение считает эту защиту лёгким препятствием: обычно она отсеивает только простых клиентов, а настоящий браузер или корректно составленный браузерный запрос часто проходит.

Оценка - это собственное эмпирическое правило расширения, а не заявление производителя, и настройки конкретного сайта могут сделать тот же продукт проще или сложнее.

## Что это значит для парсинга

Если Azure Front Door присутствует, запрос, не похожий на настоящую, согласованную сессию браузера, могут проверить, задержать или отклонить, а в ответ вместо нужного содержимого может прийти страница проверки или блокировки. Что именно произойдёт, зависит от того, как владелец сайта настроил продукт, - это может отличаться от сайта к сайту и меняться без предупреждения. Считайте обнаружение поводом изучить ответ, который вы реально получаете, а не гарантией блокировки.

Чтобы парсить страницы, защищённые Azure Front Door, не поддерживая обходные решения самостоятельно, см. [документацию по Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) от Scrapfly и [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Парсите только то, что вам разрешено, и соблюдайте условия использования сайта и правила robots.

## Определите защиту с помощью расширения

Установите бесплатное расширение [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) для Chrome, откройте нужную страницу, и во всплывающем окне появится Azure Front Door с уровнем уверенности, сложностью и точными сработавшими признаками. Подробнее читайте в [README проекта](../../README.ru.md) или смотрите [все анти-бот защиты, которые обнаруживает расширение](README.md).
