[English](../incapsula.md) | **Español** | [Русский](../ru/incapsula.md) | [简体中文](../zh-CN/incapsula.md) | [日本語](../ja/incapsula.md) | [Português (Brasil)](../pt-BR/incapsula.md) | [Deutsch](../de/incapsula.md) | [Français](../fr/incapsula.md) | [한국어](../ko/incapsula.md)

# Protección anti-bot Incapsula (Imperva): cómo detectarla (y qué implica para el web scraping)

Incapsula (Imperva) es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Incapsula (Imperva), quieres detectar Incapsula (Imperva) en un sitio o investigas un web scraping bloqueado por Incapsula (Imperva), el primer paso es el mismo: confirmar que Incapsula (Imperva) es realmente quien responde a tus solicitudes. Esta página enumera las 10 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Incapsula (Imperva), con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Incapsula es el antiguo nombre del firewall de aplicaciones web y CDN en la nube de Imperva. Combina reglas de WAF con protección contra bots y suele reconocerse por sus cookies.

Sitio oficial: [https://www.imperva.com/products/web-application-firewall-waf/](https://www.imperva.com/products/web-application-firewall-waf/)

## Cómo saber si un sitio usa Incapsula (Imperva)

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-incapsula` (versión de la regla 2.1.0, última actualización 2026-10-16). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^incap_ses_[0-9]+_[0-9]+$` | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) |
| `^visid_incap_[0-9]+$` | 100% | Incapsula visitor ID cookie (visid_incap_<site>) |
| `^nlbi_[0-9]+(?:_[0-9]+)?$` | 60% | Incapsula load balancer cookie (nlbi_<site>) |
| `^reese84$` | 100% | Imperva Advanced Bot Protection token cookie |
| `^___utmvc$` | 100% | Incapsula JavaScript challenge cookie (___utmvc) |
| `^_impv_routing$` | 40% (solo corroboración) | Imperva edge routing cookie (seen with incap_ses_ / visid_incap_) |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^x-iinfo$` | 100% | Incapsula request info response header |
| `^x-cdn$: ^(?:Imperva\|Incapsula)$` | 100% | Imperva CDN response header |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/_Incapsula_Resource\?` | 100% | Incapsula challenge resource endpoint |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `_Incapsula_Resource` | 20% | Script reference to _Incapsula_Resource or the incident page |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Incapsula session and visitor cookies | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) y (Incapsula visitor ID cookie (visid_incap_<site>) o Incapsula load balancer cookie (nlbi_<site>) o Imperva edge routing cookie (seen with incap_ses_ / visid_incap_)) |
| Imperva edge header with an Incapsula cookie | 100% | (Incapsula request info response header o Imperva CDN response header) y (Incapsula session cookie (incap_ses_<proxy>_<site>) o Incapsula visitor ID cookie (visid_incap_<site>) o Incapsula load balancer cookie (nlbi_<site>) o Imperva Advanced Bot Protection token cookie) |
| Incapsula challenge resource with a challenge cookie | 90% | Incapsula challenge resource endpoint y (Incapsula JavaScript challenge cookie (___utmvc) o Imperva Advanced Bot Protection token cookie o Incapsula session cookie (incap_ses_<proxy>_<site>)) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Incapsula (Imperva) está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Incapsula (Imperva) sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Incapsula (Imperva) con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
