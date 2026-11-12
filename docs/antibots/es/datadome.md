[English](../datadome.md) | **Español** | [Русский](../ru/datadome.md) | [简体中文](../zh-CN/datadome.md) | [日本語](../ja/datadome.md) | [Português (Brasil)](../pt-BR/datadome.md) | [Deutsch](../de/datadome.md) | [Français](../fr/datadome.md) | [한국어](../ko/datadome.md)

# Protección anti-bot DataDome: cómo detectarla (y qué implica para el web scraping)

DataDome es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de DataDome, quieres detectar DataDome en un sitio o investigas un web scraping bloqueado por DataDome, el primer paso es el mismo: confirmar que DataDome es realmente quien responde a tus solicitudes. Esta página enumera las 13 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de DataDome, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

DataDome es un proveedor francés de protección contra bots y fraude en línea. Puntúa las solicitudes con una etiqueta JavaScript y señales del servidor, y puede responder con un desafío o una página de bloqueo.

Sitio oficial: [https://datadome.co/](https://datadome.co/)

## Cómo saber si un sitio usa DataDome

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-datadome` (versión de la regla 2.2.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (solo corroboración) | DataDome block-type header on challenge responses |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:[a-z0-9-]+\.)+captcha-delivery\.com(?:[/?#:]\|$)` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (solo corroboración) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (solo corroboración) | DataDome block page bootstrap (var dd={'rt':...}) |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |
| `ddoptions (typeof object)` | 60% | DataDome tag options object (window.ddoptions) |
| `displayDataDomeResponsePage (typeof function)` | 85% | DataDome response page function (window.displayDataDomeResponsePage) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint o DataDome JS key set by the integration snippet o Integration snippet setting window.ddjskey) y DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header o DataDome protection response header o Response served by DataDome itself (block or challenge page)) y DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only y (DataDome JS key set by the integration snippet o Integration snippet setting window.ddjskey o DataDome tag options object (window.ddoptions)) |
| DataDome block page | 95% | (DataDome block page bootstrap (var dd={'rt':...}) o DataDome response page function (window.displayDataDomeResponsePage)) y (DataDome client ID response header o DataDome block-type header on challenge responses o DataDome challenge or CAPTCHA delivery host o DataDome session cookie) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si DataDome está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por DataDome sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará DataDome con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
