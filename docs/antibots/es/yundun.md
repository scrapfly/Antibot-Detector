[English](../yundun.md) | **Español** | [Русский](../ru/yundun.md) | [简体中文](../zh-CN/yundun.md) | [日本語](../ja/yundun.md) | [Português (Brasil)](../pt-BR/yundun.md) | [Deutsch](../de/yundun.md) | [Français](../fr/yundun.md) | [한국어](../ko/yundun.md)

# Protección anti-bot Yundun Cloud WAF: cómo detectarla (y qué implica para el web scraping)

Yundun Cloud WAF es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Yundun Cloud WAF, quieres detectar Yundun Cloud WAF en un sitio o investigas un web scraping bloqueado por Yundun Cloud WAF, el primer paso es el mismo: confirmar que Yundun Cloud WAF es realmente quien responde a tus solicitudes. Esta página enumera las 11 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Yundun Cloud WAF, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Yundun es un proveedor chino de seguridad en la nube que ofrece un WAF en la nube y un servicio anti-DDoS. Sus comprobaciones se ven habitualmente en sitios web chinos.

Sitio oficial: [https://www.yundun.com/](https://www.yundun.com/)

## Cómo saber si un sitio usa Yundun Cloud WAF

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-yundun` (versión de la regla 2.0.2, última actualización 2026-10-29). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (solo corroboración) | Yundun WAF session cookie |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (solo corroboración) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (solo corroboración) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (solo corroboración) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges) y Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie y (Server header carrying the Yundun edge signature (legacy edges) o Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges) y Cache header carrying the Yundun edge signature (legacy edges) y Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge y X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) y Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) o First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)) y (Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) o Yundun WAF captcha marker cookie o Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) y Yundun WAF captcha marker cookie y Server: WAF sent by the current Yundun edge |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Yundun Cloud WAF está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Yundun Cloud WAF sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Yundun Cloud WAF con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
