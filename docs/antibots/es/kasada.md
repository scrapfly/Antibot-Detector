[English](../kasada.md) | **Español** | [Русский](../ru/kasada.md) | [简体中文](../zh-CN/kasada.md) | [日本語](../ja/kasada.md) | [Português (Brasil)](../pt-BR/kasada.md) | [Deutsch](../de/kasada.md) | [Français](../fr/kasada.md) | [한국어](../ko/kasada.md)

# Protección anti-bot Kasada: cómo detectarla (y qué implica para el web scraping)

Kasada es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Kasada, quieres detectar Kasada en un sitio o investigas un web scraping bloqueado por Kasada, el primer paso es el mismo: confirmar que Kasada es realmente quien responde a tus solicitudes. Esta página enumera las 8 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Kasada, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Kasada es un proveedor de mitigación de bots. Ejecuta comprobaciones en el cliente dentro del navegador y adjunta una prueba a las solicitudes posteriores, por lo que es probable que se rechacen las solicitudes hechas sin esa prueba.

Sitio oficial: [https://www.kasada.io/](https://www.kasada.io/)

## Cómo saber si un sitio usa Kasada

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-kasada` (versión de la regla 2.1.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-kpsdk-ct$` | 100% | Kasada client token header on protected responses |
| `^x-kpsdk-(?:r\|cd\|st\|im\|v\|h)$` | 40% (solo corroboración) | Other Kasada response headers |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:ips\|p)\.js(?:[?#]\|$)` | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]{1,8}(?:\.js)?)?\?(?:[^#]*&)?(?:x-kpsdk-im\|KP_UIDz)=` | 40% (solo corroboración) | Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |
| `^https?://[^/?#]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:tl\|fp\|mfc)(?:[?#]\|$)` | 100% | Kasada telemetry or fingerprint endpoint on the double-UUID path |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `KPSDK\.(?:configure\|start\|now)` | 10% | KPSDK API call in page scripts |
| `kpsdk-load` | 10% | Kasada load event name |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `KPSDK (typeof object)` | 75% | Kasada KPSDK object |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Client script with KPSDK running | 100% | Kasada client script on its double-UUID first-party path (ips.js or p.js) y (Kasada KPSDK object o KPSDK API call in page scripts o Kasada load event name) |
| Kasada token headers with its script or interstitial | 100% | (Kasada client token header on protected responses o Other Kasada response headers) y (Kasada client script on its double-UUID first-party path (ips.js or p.js) o Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) o Kasada telemetry or fingerprint endpoint on the double-UUID path) |
| Interstitial script with KPSDK query | 90% | Kasada client script on its double-UUID first-party path (ips.js or p.js) y Kasada interstitial query parameters (KP_UIDz, x-kpsdk-im) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Kasada está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Kasada sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Kasada con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
