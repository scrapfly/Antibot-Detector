[English](../azurefrontdoor.md) | **Español** | [Русский](../ru/azurefrontdoor.md) | [简体中文](../zh-CN/azurefrontdoor.md) | [日本語](../ja/azurefrontdoor.md) | [Português (Brasil)](../pt-BR/azurefrontdoor.md) | [Deutsch](../de/azurefrontdoor.md) | [Français](../fr/azurefrontdoor.md) | [한국어](../ko/azurefrontdoor.md)

# Protección anti-bot Azure Front Door: cómo detectarla (y qué implica para el web scraping)

Azure Front Door es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Azure Front Door, quieres detectar Azure Front Door en un sitio o investigas un web scraping bloqueado por Azure Front Door, el primer paso es el mismo: confirmar que Azure Front Door es realmente quien responde a tus solicitudes. Esta página enumera las 4 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Azure Front Door, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Azure Front Door es el servicio global de entrega de contenido y de aplicaciones de Microsoft para Azure. Puede combinarse con el firewall de aplicaciones web de Azure, así que detectarlo informa sobre el edge que hay delante de un sitio, no siempre de que se filtren bots.

Sitio oficial: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## Cómo saber si un sitio usa Azure Front Door

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-azurefrontdoor` (versión de la regla 2.1.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (solo corroboración) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response y Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response y Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host y (Azure Front Door request reference header on every edge response o Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response y Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) y Resource served from an azurefd.net Front Door endpoint host |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Azure Front Door está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Azure Front Door sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Azure Front Door con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
