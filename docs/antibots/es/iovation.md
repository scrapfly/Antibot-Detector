[English](../iovation.md) | **Español** | [Русский](../ru/iovation.md) | [简体中文](../zh-CN/iovation.md) | [日本語](../ja/iovation.md) | [Português (Brasil)](../pt-BR/iovation.md) | [Deutsch](../de/iovation.md) | [Français](../fr/iovation.md) | [한국어](../ko/iovation.md)

# Protección anti-bot iovation (TransUnion TruValidate): cómo detectarla (y qué implica para el web scraping)

iovation (TransUnion TruValidate) es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de iovation (TransUnion TruValidate), quieres detectar iovation (TransUnion TruValidate) en un sitio o investigas un web scraping bloqueado por iovation (TransUnion TruValidate), el primer paso es el mismo: confirmar que iovation (TransUnion TruValidate) es realmente quien responde a tus solicitudes. Esta página enumera las 9 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de iovation (TransUnion TruValidate), con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

iovation es un servicio de reconocimiento de dispositivos y prevención del fraude que ahora forma parte de TransUnion como TruValidate. Su script recoge una «blackbox» del dispositivo que el sitio envía con las acciones sensibles.

Sitio oficial: [https://www.iovation.com/](https://www.iovation.com/)

## Cómo saber si un sitio usa iovation (TransUnion TruValidate)

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-iovation` (versión de la regla 2.0.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (solo corroboración) | iovation logo.js served through the site's own /iojs/ proxy |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (solo corroboración) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (solo corroboración) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (solo corroboración) | io_global_object_name setting read by the iovation scripts |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (solo corroboración) | Hidden ioBlackBox field that receives the iovation blackbox |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) o iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) y (IGLOO.getBlackbox function of the iovation loader o IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy o iovation logo.js served through the site's own /iojs/ proxy) y (IGLOO.getBlackbox function of the iovation loader o IGLOO.fp object created by the iovation profiling scripts o io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader o IGLOO.fp object created by the iovation profiling scripts) y (io_global_object_name setting read by the iovation scripts o iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) o Hidden ioBlackBox field that receives the iovation blackbox) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si iovation (TransUnion TruValidate) está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por iovation (TransUnion TruValidate) sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará iovation (TransUnion TruValidate) con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
