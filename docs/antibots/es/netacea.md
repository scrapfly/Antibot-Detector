[English](../netacea.md) | **Español** | [Русский](../ru/netacea.md) | [简体中文](../zh-CN/netacea.md) | [日本語](../ja/netacea.md) | [Português (Brasil)](../pt-BR/netacea.md) | [Deutsch](../de/netacea.md) | [Français](../fr/netacea.md) | [한국어](../ko/netacea.md)

# Protección anti-bot Netacea: cómo detectarla (y qué implica para el web scraping)

Netacea es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Netacea, quieres detectar Netacea en un sitio o investigas un web scraping bloqueado por Netacea, el primer paso es el mismo: confirmar que Netacea es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Netacea, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Netacea es un proveedor de gestión de bots que funciona sin un script de página en cada solicitud, ya que lee el tráfico en el edge o en el servidor. Sus cookies son el rastro visible habitual, y sus nombres pueden cambiarse por cliente.

Sitio oficial: [https://www.netacea.com/](https://www.netacea.com/)

## Cómo saber si un sitio usa Netacea

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-netacea` (versión de la regla 2.2.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^_mitata$` | 60% | Netacea mitigation cookie, in the browser or set by the server (default name) |
| `^_mitatacaptcha$` | 100% | Netacea captcha-serving cookie (default name) |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/AtaVerifyCaptcha(?:[?#]\|$)` | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Captcha cookie with a mitigation cookie | 100% | Netacea captcha-serving cookie (default name) y Netacea mitigation cookie, in the browser or set by the server (default name) |
| Captcha verification with a Netacea cookie | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) y Netacea captcha-serving cookie (default name) |
| Captcha verification with the mitigation cookie | 95% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) y Netacea mitigation cookie, in the browser or set by the server (default name) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Netacea está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Netacea sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Netacea con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
