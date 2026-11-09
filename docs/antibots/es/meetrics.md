[English](../meetrics.md) | **Español** | [Русский](../ru/meetrics.md) | [简体中文](../zh-CN/meetrics.md) | [日本語](../ja/meetrics.md) | [Português (Brasil)](../pt-BR/meetrics.md) | [Deutsch](../de/meetrics.md) | [Français](../fr/meetrics.md) | [한국어](../ko/meetrics.md)

# Protección anti-bot Meetrics Check: cómo detectarla (y qué implica para el web scraping)

Meetrics Check es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Meetrics Check, quieres detectar Meetrics Check en un sitio o investigas un web scraping bloqueado por Meetrics Check, el primer paso es el mismo: confirmar que Meetrics Check es realmente quien responde a tus solicitudes. Esta página enumera las 4 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Meetrics Check, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Meetrics es una empresa de medición de medios que ha ofrecido etiquetas de visibilidad de anuncios y de medición de fraude publicitario. El detector señala integraciones antiguas que aún hacen referencia a su script, que puede que ya no funcione.

Sitio oficial: [https://www.meetrics.com/en/](https://www.meetrics.com/en/)

## Cómo saber si un sitio usa Meetrics Check

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-meetrics` (versión de la regla 2.1.0, última actualización 2026-10-17). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}mxcdn\.net/bb-mx/serve/mtrcs_[0-9]+\.js(?:[?#]\|$)` | 40% | Legacy Meetrics tag (mxcdn.net, now parked) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}meetrics\.(?:com\|net)/` | 20% (solo corroboración) | Legacy meetrics.com/.net host |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `meetricsGlobal` | 5% | Meetrics global reference in scripts |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `meetricsGlobal (typeof object)` | 40% | Meetrics global object |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Legacy tag with its runtime | 60% | Legacy Meetrics tag (mxcdn.net, now parked) y Meetrics global object |
| Meetrics host traffic with its runtime | 50% | Legacy meetrics.com/.net host y (Meetrics global object o Meetrics global reference in scripts) |
| Legacy tag referenced in page scripts | 45% | Legacy Meetrics tag (mxcdn.net, now parked) y Meetrics global reference in scripts |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Meetrics Check está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Meetrics Check sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Meetrics Check con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
