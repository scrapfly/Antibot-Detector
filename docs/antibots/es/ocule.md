[English](../ocule.md) | **Español** | [Русский](../ru/ocule.md) | [简体中文](../zh-CN/ocule.md) | [日本語](../ja/ocule.md) | [Português (Brasil)](../pt-BR/ocule.md) | [Deutsch](../de/ocule.md) | [Français](../fr/ocule.md) | [한국어](../ko/ocule.md)

# Protección anti-bot Ocule: cómo detectarla (y qué implica para el web scraping)

Ocule es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Ocule, quieres detectar Ocule en un sitio o investigas un web scraping bloqueado por Ocule, el primer paso es el mismo: confirmar que Ocule es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Ocule, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Ocule era un servicio de protección contra bots que más tarde fue absorbido por hCaptcha. Las páginas que aún hacen referencia a él suelen ser integraciones antiguas.

Sitio oficial: [https://ocule.io/](https://ocule.io/)

## Cómo saber si un sitio usa Ocule

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-ocule` (versión de la regla 2.1.0, última actualización 2026-10-17). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://proxy\.ocule\.co\.uk/script\.js(?:[?#]\|$)` | 40% | Legacy Ocule loader script (host no longer resolves) |
| `^https://(?!proxy\.)(?:[a-z0-9-]{1,63}\.){0,4}ocule\.co\.uk/` | 20% (solo corroboración) | Other requests to the legacy ocule.co.uk host (not the loader) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `ocule.co.uk` | 5% | Reference to the legacy Ocule host |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Legacy loader with other Ocule traffic | 60% | Legacy Ocule loader script (host no longer resolves) y Other requests to the legacy ocule.co.uk host (not the loader) |
| Legacy loader referenced in page scripts | 50% | Legacy Ocule loader script (host no longer resolves) y Reference to the legacy Ocule host |
| Legacy Ocule host traffic and reference | 40% | Other requests to the legacy ocule.co.uk host (not the loader) y Reference to the legacy Ocule host |

## Dificultad

**Alta.** Alta significa que la extensión considera esta protección una de las más difíciles de superar: suele combinar comprobaciones en el cliente con una puntuación basada en el comportamiento o en el servidor.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Ocule está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Ocule sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Ocule con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
