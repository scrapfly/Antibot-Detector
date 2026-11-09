[English](../jiasule.md) | **Español** | [Русский](../ru/jiasule.md) | [简体中文](../zh-CN/jiasule.md) | [日本語](../ja/jiasule.md) | [Português (Brasil)](../pt-BR/jiasule.md) | [Deutsch](../de/jiasule.md) | [Français](../fr/jiasule.md) | [한국어](../ko/jiasule.md)

# Protección anti-bot Jiasule (Chuangyu Shield): cómo detectarla (y qué implica para el web scraping)

Jiasule (Chuangyu Shield) es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Jiasule (Chuangyu Shield), quieres detectar Jiasule (Chuangyu Shield) en un sitio o investigas un web scraping bloqueado por Jiasule (Chuangyu Shield), el primer paso es el mismo: confirmar que Jiasule (Chuangyu Shield) es realmente quien responde a tus solicitudes. Esta página enumera las 7 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Jiasule (Chuangyu Shield), con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Jiasule, también escrito Chuangyu Shield, es un servicio de protección anti-DDoS y de protección web de Knownsec, en China. A menudo muestra una puerta de JavaScript antes de cargar la página.

Sitio oficial: [https://www.jiasule.com/](https://www.jiasule.com/)

## Cómo saber si un sitio usa Jiasule (Chuangyu Shield)

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-jiasule` (versión de la regla 2.2.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (solo corroboración) | Jiasule tracking cookie set alongside the challenge cookies |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie y Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response o Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) y (Jiasule visitor id cookie set on first request o Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response y Jiasule visitor id cookie set on first request y Jiasule JavaScript-challenge clearance cookie |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Jiasule (Chuangyu Shield) está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Jiasule (Chuangyu Shield) sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Jiasule (Chuangyu Shield) con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
