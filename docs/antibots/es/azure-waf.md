[English](../azure-waf.md) | **Español** | [Русский](../ru/azure-waf.md) | [简体中文](../zh-CN/azure-waf.md) | [日本語](../ja/azure-waf.md) | [Português (Brasil)](../pt-BR/azure-waf.md) | [Deutsch](../de/azure-waf.md) | [Français](../fr/azure-waf.md) | [한국어](../ko/azure-waf.md)

# Protección anti-bot Azure WAF: cómo detectarla (y qué implica para el web scraping)

Azure WAF es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Azure WAF, quieres detectar Azure WAF en un sitio o investigas un web scraping bloqueado por Azure WAF, el primer paso es el mismo: confirmar que Azure WAF es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Azure WAF, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Azure Web Application Firewall es el WAF de Microsoft para Azure Front Door y Application Gateway. Además de bloquear ataques, sus reglas de bots pueden responder a los clientes sospechosos con un desafío JavaScript o, en Front Door, con un CAPTCHA.

Sitio oficial: [https://learn.microsoft.com/azure/web-application-firewall/](https://learn.microsoft.com/azure/web-application-firewall/)

## Cómo saber si un sitio usa Azure WAF

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-azure-waf` (versión de la regla 2.0.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^afd_azwaf_jsclearance$` | 90% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^appgw_azwaf_jsclearance$` | 90% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^afd_azwaf_captcha$` | 90% | afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Front Door JavaScript challenge and CAPTCHA cookies | 100% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) y afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |
| JavaScript challenge cookies of Front Door and Application Gateway | 95% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) y appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| Application Gateway JavaScript challenge cookie with the Front Door CAPTCHA cookie | 95% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) y afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Azure WAF está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Azure WAF sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Azure WAF con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
