[English](../anubis.md) | **Español** | [Русский](../ru/anubis.md) | [简体中文](../zh-CN/anubis.md) | [日本語](../ja/anubis.md) | [Português (Brasil)](../pt-BR/anubis.md) | [Deutsch](../de/anubis.md) | [Français](../fr/anubis.md) | [한국어](../ko/anubis.md)

# Protección anti-bot Anubis: cómo detectarla (y qué implica para el web scraping)

Anubis es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Anubis, quieres detectar Anubis en un sitio o investigas un web scraping bloqueado por Anubis, el primer paso es el mismo: confirmar que Anubis es realmente quien responde a tus solicitudes. Esta página enumera las 6 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Anubis, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Anubis es una puerta de acceso web de código abierto de Techaro que pide al navegador de cada visitante nuevo que resuelva un pequeño puzle de prueba de trabajo (proof-of-work) antes de cargar la página. Se creó para frenar a los rastreadores de IA y lo usan muchos sitios de código abierto y de comunidades.

Sitio oficial: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## Cómo saber si un sitio usa Anubis

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-anubis` (versión de la regla 2.1.1, última actualización 2026-10-30). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (solo corroboración) | Proof-of-work progress bar inner element on the challenge page |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint y (Anubis mascot image (pensive/happy/reject) loaded from the command endpoint o Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) o Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix)) y Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) y Anubis main challenge module loaded from the command endpoint y Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Anubis está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Anubis sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Anubis con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
