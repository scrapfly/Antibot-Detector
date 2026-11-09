[English](../botguard.md) | **Español** | [Русский](../ru/botguard.md) | [简体中文](../zh-CN/botguard.md) | [日本語](../ja/botguard.md) | [Português (Brasil)](../pt-BR/botguard.md) | [Deutsch](../de/botguard.md) | [Français](../fr/botguard.md) | [한국어](../ko/botguard.md)

# Protección anti-bot Google BotGuard: cómo detectarla (y qué implica para el web scraping)

Google BotGuard es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Google BotGuard, quieres detectar Google BotGuard en un sitio o investigas un web scraping bloqueado por Google BotGuard, el primer paso es el mismo: confirmar que Google BotGuard es realmente quien responde a tus solicitudes. Esta página enumera las 7 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Google BotGuard, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

BotGuard es la tecnología propia de Google de integridad del cliente y detección de bots. La usan los servicios de Google y reCAPTCHA, y Google no publica cómo funciona.

Sitio oficial: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## Cómo saber si un sitio usa Google BotGuard

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-botguard` (versión de la regla 2.3.0, última actualización 2026-10-17). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (solo corroboración) | BotGuard interpreter URL key |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `trayride (exists)` | 50% (solo corroboración) | BotGuard VM global (globalName from bgChallenge) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) o BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) y (Web Anti-Abuse (BotGuard) attestation RPC o Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) o BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) y (BotGuard challenge config key in page data o BotGuard interpreter URL key o BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC o Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) y (BotGuard VM global (globalName from bgChallenge) o BotGuard challenge config key in page data) |

## Dificultad

**Alta.** Alta significa que la extensión considera esta protección una de las más difíciles de superar: suele combinar comprobaciones en el cliente con una puntuación basada en el comportamiento o en el servidor.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Google BotGuard está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Google BotGuard sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Google BotGuard con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
