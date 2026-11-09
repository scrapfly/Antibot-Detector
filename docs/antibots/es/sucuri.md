[English](../sucuri.md) | **Español** | [Русский](../ru/sucuri.md) | [简体中文](../zh-CN/sucuri.md) | [日本語](../ja/sucuri.md) | [Português (Brasil)](../pt-BR/sucuri.md) | [Deutsch](../de/sucuri.md) | [Français](../fr/sucuri.md) | [한국어](../ko/sucuri.md)

# Protección anti-bot Sucuri WAF: cómo detectarla (y qué implica para el web scraping)

Sucuri WAF es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Sucuri WAF, quieres detectar Sucuri WAF en un sitio o investigas un web scraping bloqueado por Sucuri WAF, el primer paso es el mismo: confirmar que Sucuri WAF es realmente quien responde a tus solicitudes. Esta página enumera las 8 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Sucuri WAF, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Sucuri es una empresa de seguridad web cuyo WAF y CDN en la nube se sitúan delante de un sitio para filtrar ataques y tráfico no deseado.

Sitio oficial: [https://sucuri.net/](https://sucuri.net/)

## Cómo saber si un sitio usa Sucuri WAF

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-sucuri` (versión de la regla 2.1.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (solo corroboración) | Sucuri cache status header |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `Sucuri WebSite Firewall - Access Denied` | 30% (solo corroboración) | Sucuri block page title |
| `Block ID:` | 20% (solo corroboración) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title o Block ID label on the Sucuri block page) y (Sucuri WAF node id header o Sucuri block reason header o Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header y (Sucuri WAF node id header o Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable y (Sucuri CloudProxy JS-challenge cookie o Sucuri WAF node id header o Sucuri CloudProxy server header) |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Sucuri WAF está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Sucuri WAF sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Sucuri WAF con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
