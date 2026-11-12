[English](../bunny-shield.md) | **Español** | [Русский](../ru/bunny-shield.md) | [简体中文](../zh-CN/bunny-shield.md) | [日本語](../ja/bunny-shield.md) | [Português (Brasil)](../pt-BR/bunny-shield.md) | [Deutsch](../de/bunny-shield.md) | [Français](../fr/bunny-shield.md) | [한국어](../ko/bunny-shield.md)

# Protección anti-bot Bunny Shield: cómo detectarla (y qué implica para el web scraping)

Bunny Shield es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Bunny Shield, quieres detectar Bunny Shield en un sitio o investigas un web scraping bloqueado por Bunny Shield, el primer paso es el mismo: confirmar que Bunny Shield es realmente quien responde a tus solicitudes. Esta página enumera las 5 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Bunny Shield, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Bunny Shield es el producto de seguridad en el edge de bunny.net, una empresa de CDN. Añade un firewall de aplicaciones web, limitación de peticiones y detección de bots a los sitios de bunny.net, y puede pedir al navegador que resuelva un desafío JavaScript de prueba de trabajo.

Sitio oficial: [https://bunny.net/shield/](https://bunny.net/shield/)

## Cómo saber si un sitio usa Bunny Shield

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-bunny-shield` (versión de la regla 2.0.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^bunny_shield$` | 90% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) |
| `^bunny_shield_chk$` | 90% | bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| `^bunny_shield_id$` | 90% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) |
| `^bunny_shield_bd$` | 90% | bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^server$: ^BunnyCDN-[A-Z0-9]{2,6}-[0-9]{1,8}$` | 40% (solo corroboración) | Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Proof-of-work cookie with its checksum | 100% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) y bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| Bot detection identifier and fingerprint cookies | 95% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) y bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |
| Bunny Shield cookie on a bunny.net edge response | 95% | (bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) o bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) o bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) o bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs)) y Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Bunny Shield está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Bunny Shield sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Bunny Shield con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
