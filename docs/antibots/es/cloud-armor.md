[English](../cloud-armor.md) | **Español** | [Русский](../ru/cloud-armor.md) | [简体中文](../zh-CN/cloud-armor.md) | [日本語](../ja/cloud-armor.md) | [Português (Brasil)](../pt-BR/cloud-armor.md) | [Deutsch](../de/cloud-armor.md) | [Français](../fr/cloud-armor.md) | [한국어](../ko/cloud-armor.md)

# Protección anti-bot Google Cloud Armor: cómo detectarla (y qué implica para el web scraping)

Google Cloud Armor es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Google Cloud Armor, quieres detectar Google Cloud Armor en un sitio o investigas un web scraping bloqueado por Google Cloud Armor, el primer paso es el mismo: confirmar que Google Cloud Armor es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Google Cloud Armor, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Google Cloud Armor es el servicio de WAF y protección DDoS delante de los balanceadores de carga de Google Cloud. Su gestión de bots usa reCAPTCHA para poner a prueba a los visitantes y comprobar los tokens que reCAPTCHA deja en su navegador.

Sitio oficial: [https://cloud.google.com/security/products/armor](https://cloud.google.com/security/products/armor)

## Cómo saber si un sitio usa Google Cloud Armor

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-cloud-armor` (versión de la regla 2.0.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^recaptcha-ca-e$` | 90% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) |
| `^recaptcha-ca-t$` | 70% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://www\.(?:google\.com\|recaptcha\.net)/recaptcha/(?:api\|enterprise)\.js\?(?:[^#]*&)?waf=session(?:[&#]\|$)` | 50% (solo corroboración) | reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Exemption cookie and session-token cookie | 100% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) y recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |
| Session-token cookie with the reCAPTCHA script that sets it | 85% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) y reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |
| Exemption cookie with a reCAPTCHA for WAF session-token script | 95% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) y reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Google Cloud Armor está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Google Cloud Armor sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Google Cloud Armor con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
