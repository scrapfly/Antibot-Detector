[English](../castle.md) | **Español** | [Русский](../ru/castle.md) | [简体中文](../zh-CN/castle.md) | [日本語](../ja/castle.md) | [Português (Brasil)](../pt-BR/castle.md) | [Deutsch](../de/castle.md) | [Français](../fr/castle.md) | [한국어](../ko/castle.md)

# Protección anti-bot Castle: cómo detectarla (y qué implica para el web scraping)

Castle es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Castle, quieres detectar Castle en un sitio o investigas un web scraping bloqueado por Castle, el primer paso es el mismo: confirmar que Castle es realmente quien responde a tus solicitudes. Esta página enumera las 6 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Castle, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Castle es un proveedor de seguridad que ofrece protección contra la apropiación de cuentas, los bots y el abuso. Su script del navegador genera un token de solicitud que el sitio envía a la API de Castle junto con los inicios de sesión y las acciones sensibles.

Sitio oficial: [https://castle.io/](https://castle.io/)

## Cómo saber si un sitio usa Castle

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-castle` (versión de la regla 2.0.1, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^__cuid$` | 30% | __cuid device cookie Castle.js stores by default |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://cdn\.castle\.io/v2/castle\.js(?:[?#]\|$)` | 100% | Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) |
| `^https://m\.castle\.io/v1/monitor(?:[/?#]\|$)` | 100% | Castle.js event request to the vendor m.castle.io monitor endpoint |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `Castle.createRequestToken (typeof function)` | 60% | Castle.createRequestToken function of the Castle.js global |
| `Castle.injectTokenOnSubmit (typeof function)` | 50% (solo corroboración) | Castle.injectTokenOnSubmit form helper of the Castle.js global |
| `_castle (typeof function)` | 30% (solo corroboración) | _castle function set by the CDN castle.js |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Castle.js from its host with its cookie or global | 100% | (Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) o Castle.js event request to the vendor m.castle.io monitor endpoint) y (__cuid device cookie Castle.js stores by default o Castle.createRequestToken function of the Castle.js global o _castle function set by the CDN castle.js) |
| __cuid cookie with Castle.js | 90% | __cuid device cookie Castle.js stores by default y (Castle.createRequestToken function of the Castle.js global o Castle.injectTokenOnSubmit form helper of the Castle.js global o _castle function set by the CDN castle.js o Castle.js loaded from the vendor cdn.castle.io host (v2/castle.js) o Castle.js event request to the vendor m.castle.io monitor endpoint) |
| Castle.js global with its helpers | 80% | Castle.createRequestToken function of the Castle.js global y Castle.injectTokenOnSubmit form helper of the Castle.js global |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Castle está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Castle sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Castle con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
