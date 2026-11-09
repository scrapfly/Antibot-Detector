[English](../amazon.md) | **Español** | [Русский](../ru/amazon.md) | [简体中文](../zh-CN/amazon.md) | [日本語](../ja/amazon.md) | [Português (Brasil)](../pt-BR/amazon.md) | [Deutsch](../de/amazon.md) | [Français](../fr/amazon.md) | [한국어](../ko/amazon.md)

# Protección anti-bot Amazon Bot Protection: cómo detectarla (y qué implica para el web scraping)

Amazon Bot Protection es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Amazon Bot Protection, quieres detectar Amazon Bot Protection en un sitio o investigas un web scraping bloqueado por Amazon Bot Protection, el primer paso es el mismo: confirmar que Amazon Bot Protection es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Amazon Bot Protection, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Las páginas de inicio de sesión de Amazon recogen una huella digital del navegador en el cliente, que el formulario de acceso envía junto con las credenciales. Forma parte de las herramientas antiabuso propias de Amazon, no de un producto que otros sitios puedan comprar.

Sitio oficial: [https://www.amazon.com/](https://www.amazon.com/)

## Cómo saber si un sitio usa Amazon Bot Protection

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-amazon` (versión de la regla 2.1.1, última actualización 2026-11-04). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `fwcimCmd` | 30% (solo corroboración) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (solo corroboración) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint y FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint y Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages y Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## Dificultad

**Alta.** Alta significa que la extensión considera esta protección una de las más difíciles de superar: suele combinar comprobaciones en el cliente con una puntuación basada en el comportamiento o en el servidor.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Amazon Bot Protection está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Amazon Bot Protection sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Amazon Bot Protection con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
