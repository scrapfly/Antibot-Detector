[English](../signifyd.md) | **Español** | [Русский](../ru/signifyd.md) | [简体中文](../zh-CN/signifyd.md) | [日本語](../ja/signifyd.md) | [Português (Brasil)](../pt-BR/signifyd.md) | [Deutsch](../de/signifyd.md) | [Français](../fr/signifyd.md) | [한국어](../ko/signifyd.md)

# Protección anti-bot Signifyd: cómo detectarla (y qué implica para el web scraping)

Signifyd es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Signifyd, quieres detectar Signifyd en un sitio o investigas un web scraping bloqueado por Signifyd, el primer paso es el mismo: confirmar que Signifyd es realmente quien responde a tus solicitudes. Esta página enumera las 9 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Signifyd, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Signifyd es una plataforma de protección contra el fraude en comercio electrónico que usan las tiendas online. Su script de perfilado del dispositivo recoge datos del dispositivo y del navegador en las páginas de la tienda para que Signifyd puntúe el riesgo de fraude de los pedidos.

Sitio oficial: [https://www.signifyd.com/](https://www.signifyd.com/)

## Cómo saber si un sitio usa Signifyd

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-signifyd` (versión de la regla 2.0.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://cdn-scripts\.signifyd\.com/(?:api\|bigcommerce\|shopify)/script-tag\.js(?:[?#]\|$)` | 100% | Signifyd device profiling script script-tag.js on cdn-scripts.signifyd.com (standard, BigCommerce or Shopify) |
| `^https://cdn-scripts\.signifyd\.com/(?:api/company_toolkit\|o/(?:loader\|lite)\|bigcommerce/conversion-tracking)\.js(?:[?#]\|$)` | 100% | Other Signifyd scripts on cdn-scripts.signifyd.com (company_toolkit.js, loader.js, lite.js, BigCommerce conversion-tracking.js) |
| `^https://dp\.signifyd\.com/fp-web(?:[?#]\|$)` | 100% | Device profile sent to dp.signifyd.com/fp-web |
| `^https?://[^/?#]+/api/script-tag\.js(?:[?#]\|$)` | 40% (solo corroboración) | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only |
| `^https?://[^/?#]+/o/lite\.js(?:[?#]\|$)` | 30% (solo corroboración) | First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only |
| `^https?://[^/?#]+/fp-web(?:[?#]\|$)` | 30% (solo corroboración) | First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `signifyd.pageView (typeof function)` | 60% | signifyd.pageView method the Signifyd script exposes for single-page applications |
| `sigScriptLoader (typeof object)` | 60% | sigScriptLoader object of the Signifyd script, with its isInitialized flag |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `script#script-tag-api[data-order-session-id], script#sig-api[data-order-session-id], script#sig-bc[data-store-id]` | 60% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Signifyd script tag served from the site with its profiling routes | 100% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute y First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only y (First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only o First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only) |
| Signifyd script tag with its runtime | 95% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute y (signifyd.pageView method the Signifyd script exposes for single-page applications o sigScriptLoader object of the Signifyd script, with its isInitialized flag) |
| All three Signifyd routes served from the site | 85% | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only y First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only y First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |
| Signifyd loader and page-view method | 85% | signifyd.pageView method the Signifyd script exposes for single-page applications y sigScriptLoader object of the Signifyd script, with its isInitialized flag |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Signifyd está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Signifyd sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Signifyd con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
