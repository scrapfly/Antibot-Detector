[English](../cloudflare-waitingroom.md) | **Español** | [Русский](../ru/cloudflare-waitingroom.md) | [简体中文](../zh-CN/cloudflare-waitingroom.md) | [日本語](../ja/cloudflare-waitingroom.md) | [Português (Brasil)](../pt-BR/cloudflare-waitingroom.md) | [Deutsch](../de/cloudflare-waitingroom.md) | [Français](../fr/cloudflare-waitingroom.md) | [한국어](../ko/cloudflare-waitingroom.md)

# Protección anti-bot Cloudflare Waiting Room: cómo detectarla (y qué implica para el web scraping)

Cloudflare Waiting Room es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Cloudflare Waiting Room, quieres detectar Cloudflare Waiting Room en un sitio o investigas un web scraping bloqueado por Cloudflare Waiting Room, el primer paso es el mismo: confirmar que Cloudflare Waiting Room es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Cloudflare Waiting Room, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Cloudflare Waiting Room es una función de Cloudflare que pone a los visitantes en una cola cuando un sitio espera más tráfico del que su servidor de origen puede soportar. Es una herramienta de control de tráfico, no un detector de bots, pero la página de la cola sigue deteniendo a los scrapers simples.

Sitio oficial: [https://developers.cloudflare.com/waiting-room/](https://developers.cloudflare.com/waiting-room/)

## Cómo saber si un sitio usa Cloudflare Waiting Room

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-cloudflare-waitingroom` (versión de la regla 2.1.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^__cfwaitingroom$` | 100% | Waiting Room cookie that keeps the visitor's place in the queue |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^server$: ^cloudflare$` | 15% (solo corroboración) | Served through Cloudflare; CDN delivery, not a queue on its own |
| `^cf-ray$: ^[0-9a-f]{12,20}-[A-Z]{3,4}$` | 15% (solo corroboración) | Cloudflare request id header; present on any Cloudflare response |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Queue cookie on a Cloudflare response | 85% | Waiting Room cookie that keeps the visitor's place in the queue y Served through Cloudflare; CDN delivery, not a queue on its own |
| Queue cookie with a Cloudflare request id | 80% | Waiting Room cookie that keeps the visitor's place in the queue y Cloudflare request id header; present on any Cloudflare response |
| Queue cookie with Cloudflare server and request id | 100% | Waiting Room cookie that keeps the visitor's place in the queue y Served through Cloudflare; CDN delivery, not a queue on its own y Cloudflare request id header; present on any Cloudflare response |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Cloudflare Waiting Room está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Cloudflare Waiting Room sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Cloudflare Waiting Room con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
