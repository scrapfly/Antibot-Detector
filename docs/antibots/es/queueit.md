[English](../queueit.md) | **Español** | [Русский](../ru/queueit.md) | [简体中文](../zh-CN/queueit.md) | [日本語](../ja/queueit.md) | [Português (Brasil)](../pt-BR/queueit.md) | [Deutsch](../de/queueit.md) | [Français](../fr/queueit.md) | [한국어](../ko/queueit.md)

# Protección anti-bot Queue-it: cómo detectarla (y qué implica para el web scraping)

Queue-it es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Queue-it, quieres detectar Queue-it en un sitio o investigas un web scraping bloqueado por Queue-it, el primer paso es el mismo: confirmar que Queue-it es realmente quien responde a tus solicitudes. Esta página enumera las 9 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Queue-it, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Queue-it es un servicio de sala de espera virtual. Envía a los visitantes a una página de cola cuando un sitio está sobrecargado, por ejemplo durante una venta de entradas o de productos. Controla el tráfico en lugar de detectar bots, aunque también ofrece opciones de filtrado de bots.

Sitio oficial: [https://queue-it.com/](https://queue-it.com/)

## Cómo saber si un sitio usa Queue-it

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-queueit` (versión de la regla 2.0.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^QueueITAccepted-SDFrts345E-V3_` | 60% | Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue |
| `^Queue-it-visitorsession$` | 100% | Queue-it-visitorsession cookie set by the queue page |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://static\.queue-it\.net/script/(?:queueclient\|queueconfigloader)(?:\.min)?\.js(?:[?#]\|$)` | 100% | Queue-it JavaScript connector loaded from static.queue-it.net |
| `^https?://assets\.queue-it\.net/[a-z0-9_-]+/integrationconfig/javascript/queueclientConfig\.js` | 100% | Queue-it integration config requested from assets.queue-it.net |
| `^https?://assets\.queue-it\.net/static/QueueFront/` | 100% | Queue page scripts and images from assets.queue-it.net/static/QueueFront/ |
| `^https?://(?!(?:go\|static\|assets\|www)\.)[a-z0-9-]+\.queue-it\.net/` | 100% | Queue-it queue page on a customer subdomain of queue-it.net |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?queueittoken=` | 40% (solo corroboración) | queueittoken parameter in the page address after leaving the queue |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `QueueIt.Javascript (typeof object)` | 60% | QueueIt.Javascript object created by the Queue-it connector |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `script[data-queueit-c]` | 50% | Queue-it connector script tag with its data-queueit-c customer attribute |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Connector script with its runtime or tag | 100% | (Queue-it JavaScript connector loaded from static.queue-it.net o Queue-it integration config requested from assets.queue-it.net) y (QueueIt.Javascript object created by the Queue-it connector o Queue-it connector script tag with its data-queueit-c customer attribute) |
| Queue page with its scripts or session cookie | 100% | Queue-it queue page on a customer subdomain of queue-it.net y (Queue page scripts and images from assets.queue-it.net/static/QueueFront/ o Queue-it-visitorsession cookie set by the queue page) |
| Back from the queue with its token or cookie | 90% | (queueittoken parameter in the page address after leaving the queue o Queue-it cookie QueueITAccepted-SDFrts345E-V3_<event> set after passing the queue) y (Queue-it JavaScript connector loaded from static.queue-it.net o Queue-it integration config requested from assets.queue-it.net o QueueIt.Javascript object created by the Queue-it connector o Queue-it connector script tag with its data-queueit-c customer attribute) |
| Connector tag with the Queue-it runtime | 85% | Queue-it connector script tag with its data-queueit-c customer attribute y QueueIt.Javascript object created by the Queue-it connector |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Queue-it está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Queue-it sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Queue-it con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
