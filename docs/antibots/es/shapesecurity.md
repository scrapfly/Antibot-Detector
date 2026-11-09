[English](../shapesecurity.md) | **Español** | [Русский](../ru/shapesecurity.md) | [简体中文](../zh-CN/shapesecurity.md) | [日本語](../ja/shapesecurity.md) | [Português (Brasil)](../pt-BR/shapesecurity.md) | [Deutsch](../de/shapesecurity.md) | [Français](../fr/shapesecurity.md) | [한국어](../ko/shapesecurity.md)

# Protección anti-bot Shape Security: cómo detectarla (y qué implica para el web scraping)

Shape Security es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Shape Security, quieres detectar Shape Security en un sitio o investigas un web scraping bloqueado por Shape Security, el primer paso es el mismo: confirmar que Shape Security es realmente quien responde a tus solicitudes. Esta página enumera las 5 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Shape Security, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Shape Security, adquirida por F5, desarrolló una defensa empresarial contra bots orientada al fraude, al credential stuffing y a la automatización en los flujos de inicio de sesión y de pago.

Sitio oficial: [https://www.shapesecurity.com/products/bot-manager](https://www.shapesecurity.com/products/bot-manager)

## Cómo saber si un sitio usa Shape Security

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-shapesecurity` (versión de la regla 2.1.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?seed=[A-Za-z0-9_-]{40,}` | 85% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{0,60}/ssx\.mod\.js(?:\?async)?(?:#\|$)` | 60% (solo corroboración) | Shape ssx.mod.js loader (Target, Nordstrom) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?X-[A-Za-z0-9]{6,10}--z=q(?:&\|#\|$)` | 50% (solo corroboración) | Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `__xr_bmobdb` | 10% | Shape runtime global reference |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `__xr_bmobdb (exists)` | 80% | Shape runtime global (__xr_bmobdb) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Seeded loader with its runtime | 100% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) y (Shape runtime global (__xr_bmobdb) o Shape runtime global reference o Shape seeded-script marker parameter (X-xxxxxxxx--z=q)) |
| ssx.mod.js loader with the Shape runtime | 90% | Shape ssx.mod.js loader (Target, Nordstrom) y (Shape runtime global (__xr_bmobdb) o Shape loader with its long seed parameter (ssx.mod.js?seed=...)) |
| ssx.mod.js loader with the seeded-script marker | 80% | Shape ssx.mod.js loader (Target, Nordstrom) y Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

## Dificultad

**Alta.** Alta significa que la extensión considera esta protección una de las más difíciles de superar: suele combinar comprobaciones en el cliente con una puntuación basada en el comportamiento o en el servidor.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Shape Security está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Shape Security sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Shape Security con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
