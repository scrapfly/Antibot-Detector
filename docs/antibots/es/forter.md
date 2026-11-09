[English](../forter.md) | **Español** | [Русский](../ru/forter.md) | [简体中文](../zh-CN/forter.md) | [日本語](../ja/forter.md) | [Português (Brasil)](../pt-BR/forter.md) | [Deutsch](../de/forter.md) | [Français](../fr/forter.md) | [한국어](../ko/forter.md)

# Protección anti-bot Forter: cómo detectarla (y qué implica para el web scraping)

Forter es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Forter, quieres detectar Forter en un sitio o investigas un web scraping bloqueado por Forter, el primer paso es el mismo: confirmar que Forter es realmente quien responde a tus solicitudes. Esta página enumera las 7 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Forter, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Forter es un proveedor de prevención del fraude para el comercio en línea. Su script toma la huella digital del navegador y el sitio envía el token resultante junto con las decisiones de pago e inicio de sesión.

Sitio oficial: [https://www.forter.com/](https://www.forter.com/)

## Cómo saber si un sitio usa Forter

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-forter` (versión de la regla 2.0.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^forterToken$` | 90% | forterToken cookie set by the Forter script |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://[0-9a-f]{12}\.cdn4\.forter\.com/sns?/[0-9a-f]{12}/(?:[^?#]*/)?script\.js(?:[?#]\|$)` | 100% | Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) |
| `^https://(?:[0-9a-f-]+\.)?cdn\d*\.forter\.com/(?:events\|[^?#]*\.json)(?:[?#]\|$)` | 100% | Forter collection request to a forter.com CDN host (prop.json, wpt.json, events) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `\bftr__(?:startScriptLoad\|config)\b` | 20% (solo corroboración) | Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config) |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `ftr__config (typeof object)` | 60% | ftr__config object set by the Forter loader snippet |
| `ftr__startScriptLoad (typeof number)` | 50% (solo corroboración) | ftr__startScriptLoad timestamp set by the Forter loader snippet |
| `ftr__JSON3 (typeof object)` | 50% (solo corroboración) | ftr__JSON3 object set by the Forter script |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Forter script with its token cookie or config | 100% | (Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) o Forter collection request to a forter.com CDN host (prop.json, wpt.json, events)) y (forterToken cookie set by the Forter script o ftr__config object set by the Forter loader snippet) |
| forterToken cookie with the Forter runtime | 100% | forterToken cookie set by the Forter script y (ftr__config object set by the Forter loader snippet o ftr__startScriptLoad timestamp set by the Forter loader snippet o ftr__JSON3 object set by the Forter script o Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config)) |
| Forter loader globals together | 85% | ftr__config object set by the Forter loader snippet y (ftr__startScriptLoad timestamp set by the Forter loader snippet o ftr__JSON3 object set by the Forter script) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Forter está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Forter sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Forter con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
