[English](../radware.md) | **Español** | [Русский](../ru/radware.md) | [简体中文](../zh-CN/radware.md) | [日本語](../ja/radware.md) | [Português (Brasil)](../pt-BR/radware.md) | [Deutsch](../de/radware.md) | [Français](../fr/radware.md) | [한국어](../ko/radware.md)

# Protección anti-bot Radware Bot Manager: cómo detectarla (y qué implica para el web scraping)

Radware Bot Manager es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Radware Bot Manager, quieres detectar Radware Bot Manager en un sitio o investigas un web scraping bloqueado por Radware Bot Manager, el primer paso es el mismo: confirmar que Radware Bot Manager es realmente quien responde a tus solicitudes. Esta página enumera las 10 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Radware Bot Manager, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Radware Bot Manager, antes ShieldSquare, es el producto de gestión de bots de Radware. Radware también vende un WAF en la nube, y el detector busca rastros de ambos.

Sitio oficial: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## Cómo saber si un sitio usa Radware Bot Manager

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-radware` (versión de la regla 2.3.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (solo corroboración) | Radware Bot Manager cookies written by its JavaScript |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `CloudWebSec[.@]radware\.com` | 20% (solo corroboración) | CloudWebSec contact address on the Radware block page |
| `Unauthorized Request Blocked` | 20% (solo corroboración) | Radware block-page message |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | CloudWebSec contact address on the Radware block page y Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header y (CloudWebSec contact address on the Radware block page o Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header y CloudWebSec contact address on the Radware block page y Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) y First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) y First-party Radware Bot Manager script (stormcaster.js) y Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host y Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge y (Radware Bot Manager session cookies (__uzma … __uzmf) o Radware Bot Manager cookies written by its JavaScript) |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Radware Bot Manager está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Radware Bot Manager sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Radware Bot Manager con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
