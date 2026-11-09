[English](../hunt.md) | **Español** | [Русский](../ru/hunt.md) | [简体中文](../zh-CN/hunt.md) | [日本語](../ja/hunt.md) | [Português (Brasil)](../pt-BR/hunt.md) | [Deutsch](../de/hunt.md) | [Français](../fr/hunt.md) | [한국어](../ko/hunt.md)

# Protección anti-bot Hunt: cómo detectarla (y qué implica para el web scraping)

Hunt es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Hunt, quieres detectar Hunt en un sitio o investigas un web scraping bloqueado por Hunt, el primer paso es el mismo: confirmar que Hunt es realmente quien responde a tus solicitudes. Esta página enumera las 4 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Hunt, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Hunt es un sistema anti-bot que se ve en algunas plataformas de apuestas. Recoge una huella digital del navegador y puede continuar con un captcha interactivo cuando decide bloquear.

Sitio oficial: [https://docs.capmonster.cloud/docs/captchas/hunt-task/](https://docs.capmonster.cloud/docs/captchas/hunt-task/)

## Cómo saber si un sitio usa Hunt

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-hunt` (versión de la regla 2.2.0, última actualización 2026-10-17). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/hd-api/external/apps/[0-9A-Za-z_-]+/api\.js(?:[?#]\|$)` | 60% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/assets/hdf\.js(?:[?#]\|$)` | 45% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/verify(?:[/?#]\|$)` | 50% | Hunt verify request that sends the browser check (hd-api/external/verify) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `/hd-api/external/apps/` | 15% | Script reference to the Hunt hd-api path |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Hunt loader with its fingerprint script | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host y Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| Hunt loader with a verify request | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host y Hunt verify request that sends the browser check (hd-api/external/verify) |
| Fingerprint script with a verify request | 85% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host y Hunt verify request that sends the browser check (hd-api/external/verify) |
| Hunt loader requested and referenced in page scripts | 75% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host y Script reference to the Hunt hd-api path |

## Dificultad

**Alta.** Alta significa que la extensión considera esta protección una de las más difíciles de superar: suele combinar comprobaciones en el cliente con una puntuación basada en el comportamiento o en el servidor.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Hunt está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Hunt sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Hunt con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
