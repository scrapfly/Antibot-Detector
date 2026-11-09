[English](../ddosguard.md) | **Español** | [Русский](../ru/ddosguard.md) | [简体中文](../zh-CN/ddosguard.md) | [日本語](../ja/ddosguard.md) | [Português (Brasil)](../pt-BR/ddosguard.md) | [Deutsch](../de/ddosguard.md) | [Français](../fr/ddosguard.md) | [한국어](../ko/ddosguard.md)

# Protección anti-bot DDoS-Guard: cómo detectarla (y qué implica para el web scraping)

DDoS-Guard es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de DDoS-Guard, quieres detectar DDoS-Guard en un sitio o investigas un web scraping bloqueado por DDoS-Guard, el primer paso es el mismo: confirmar que DDoS-Guard es realmente quien responde a tus solicitudes. Esta página enumera las 4 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de DDoS-Guard, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

DDoS-Guard es un proveedor de alojamiento y de protección contra DDoS que funciona como proxy inverso. Puede mostrar una comprobación del navegador a los visitantes que quiere verificar.

Sitio oficial: [https://ddos-guard.net/](https://ddos-guard.net/)

## Cómo saber si un sitio usa DDoS-Guard

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-ddosguard` (versión de la regla 2.0.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^__ddg(?:[0-9]{1,2}\|id\|mark)_$` | 100% | DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^server$: ^ddos-guard$` | 100% | DDoS-Guard server header |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/ddos-guard/(?:check\|js-challenge/\|id/)` | 100% | DDoS-Guard check scripts under /.well-known/ddos-guard/ |
| `^https?://check\.ddos-guard\.net/` | 100% | Request to check.ddos-guard.net |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| DDoS-Guard server with its cookies | 100% | DDoS-Guard server header y DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |
| Browser check script on a DDoS-Guard response | 100% | (DDoS-Guard check scripts under /.well-known/ddos-guard/ o Request to check.ddos-guard.net) y (DDoS-Guard server header o DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies)) |
| Check scripts on the site and on check.ddos-guard.net | 95% | DDoS-Guard check scripts under /.well-known/ddos-guard/ y Request to check.ddos-guard.net |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si DDoS-Guard está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por DDoS-Guard sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará DDoS-Guard con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
