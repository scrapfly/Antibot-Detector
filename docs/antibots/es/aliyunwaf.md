[English](../aliyunwaf.md) | **Español** | [Русский](../ru/aliyunwaf.md) | [简体中文](../zh-CN/aliyunwaf.md) | [日本語](../ja/aliyunwaf.md) | [Português (Brasil)](../pt-BR/aliyunwaf.md) | [Deutsch](../de/aliyunwaf.md) | [Français](../fr/aliyunwaf.md) | [한국어](../ko/aliyunwaf.md)

# Protección anti-bot Alibaba Cloud WAF: cómo detectarla (y qué implica para el web scraping)

Alibaba Cloud WAF es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Alibaba Cloud WAF, quieres detectar Alibaba Cloud WAF en un sitio o investigas un web scraping bloqueado por Alibaba Cloud WAF, el primer paso es el mismo: confirmar que Alibaba Cloud WAF es realmente quien responde a tus solicitudes. Esta página enumera las 8 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Alibaba Cloud WAF, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Alibaba Cloud WAF es el firewall de aplicaciones web de Alibaba Cloud. Además de filtrar ataques, puede mostrar desafíos de JavaScript a los clientes en los que no confía, por lo que aparece delante de muchos sitios chinos y de algunos sitios globales.

Sitio oficial: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## Cómo saber si un sitio usa Alibaba Cloud WAF

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-aliyunwaf` (versión de la regla 2.1.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (solo corroboración) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (solo corroboración) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (solo corroboración) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (solo corroboración) | Trace-id line of the Alibaba Cloud WAF block page |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie y Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) y Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie y (Alibaba Cloud WAF load-balancing session cookie o Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host y (Alibaba Cloud WAF JavaScript-challenge clearance cookie o Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) o Banner image of the Alibaba Cloud WAF 405 block page (English UI)) y Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie y Alibaba Cloud WAF load-balancing session cookie y Block-page help resources on the Aliyun Yundun errors host |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Alibaba Cloud WAF está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Alibaba Cloud WAF sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Alibaba Cloud WAF con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
