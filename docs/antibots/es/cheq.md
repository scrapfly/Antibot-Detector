[English](../cheq.md) | **Español** | [Русский](../ru/cheq.md) | [简体中文](../zh-CN/cheq.md) | [日本語](../ja/cheq.md) | [Português (Brasil)](../pt-BR/cheq.md) | [Deutsch](../de/cheq.md) | [Français](../fr/cheq.md) | [한국어](../ko/cheq.md)

# Protección anti-bot Cheq: cómo detectarla (y qué implica para el web scraping)

Cheq es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Cheq, quieres detectar Cheq en un sitio o investigas un web scraping bloqueado por Cheq, el primer paso es el mismo: confirmar que Cheq es realmente quien responde a tus solicitudes. Esta página enumera las 12 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Cheq, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

CHEQ es una empresa de seguridad go-to-market que vende prevención de bots, de tráfico no válido y de fraude, sobre todo para el tráfico de publicidad y marketing.

Sitio oficial: [https://cheq.ai/](https://cheq.ai/)

## Cómo saber si un sitio usa Cheq

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-cheq` (versión de la regla 2.2.0, última actualización 2026-10-17). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^_cq_(?:duid\|suid)$` | 50% | CHEQ visitor/session id cookie |
| `^(?:_cq_session\|_cq_rti\|_cheq_rti)$` | 30% (solo corroboración) | Other CHEQ cookies |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://tms\.cheq\.ai/` | 75% | CHEQ tag manager bootstrap (tms.cheq.ai) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheqzone\.com/` | 100% | CHEQ ClickTrue host (cheqzone.com) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}cheq\.ai/` | 50% (solo corroboración) | Other cheq.ai service host |
| `^https?://[^/?#]+/__cheq/(?:validate\|block)(?:[/?#]\|$)` | 100% | CHEQ first-party validation or block endpoint (/__cheq/validate, /__cheq/block) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `onCheqResponse` | 10% | CHEQ JSONP callback name |
| `__CheqSdk` | 10% | CHEQ SDK global reference |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `__CheqSdk (exists)` | 75% | CHEQ SDK global |
| `_cq (typeof object)` | 40% (solo corroboración) | CHEQ queue object (_cq) |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `script[class^="ct_clicktrue_"]` | 80% | ClickTrue tag; served from a disguised random host, identified by its class |
| `script[data-jsonp="onCheqResponse"]` | 80% | CHEQ tag with its JSONP callback attribute |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| CHEQ tag with its runtime or cookies | 100% | (ClickTrue tag; served from a disguised random host, identified by its class o CHEQ tag with its JSONP callback attribute o CHEQ ClickTrue host (cheqzone.com)) y (CHEQ SDK global o CHEQ visitor/session id cookie) |
| CHEQ cookies with its queue | 85% | (CHEQ visitor/session id cookie o Other CHEQ cookies) y (CHEQ queue object (_cq) o CHEQ JSONP callback name o CHEQ SDK global reference) |
| cheq.ai service host with CHEQ cookie | 80% | Other cheq.ai service host y (CHEQ visitor/session id cookie o Other CHEQ cookies) |
| CHEQ tag manager or tag with its queue or auxiliary cookies | 95% | (CHEQ tag manager bootstrap (tms.cheq.ai) y (CHEQ SDK global o CHEQ queue object (_cq) o CHEQ visitor/session id cookie o Other CHEQ cookies)) o ((ClickTrue tag; served from a disguised random host, identified by its class o CHEQ tag with its JSONP callback attribute o CHEQ ClickTrue host (cheqzone.com)) y (CHEQ queue object (_cq) o Other CHEQ cookies)) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Cheq está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Cheq sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Cheq con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
