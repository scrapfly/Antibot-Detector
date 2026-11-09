[English](../deepseek-pow.md) | **Español** | [Русский](../ru/deepseek-pow.md) | [简体中文](../zh-CN/deepseek-pow.md) | [日本語](../ja/deepseek-pow.md) | [Português (Brasil)](../pt-BR/deepseek-pow.md) | [Deutsch](../de/deepseek-pow.md) | [Français](../fr/deepseek-pow.md) | [한국어](../ko/deepseek-pow.md)

# Protección anti-bot DeepSeek PoW: cómo detectarla (y qué implica para el web scraping)

DeepSeek PoW es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de DeepSeek PoW, quieres detectar DeepSeek PoW en un sitio o investigas un web scraping bloqueado por DeepSeek PoW, el primer paso es el mismo: confirmar que DeepSeek PoW es realmente quien responde a tus solicitudes. Esta página enumera las 5 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de DeepSeek PoW, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

La aplicación web de chat de DeepSeek pide al navegador que resuelva un desafío de prueba de trabajo (proof-of-work) antes de aceptar una solicitud de chat. Es la protección propia del servicio, no un producto que se venda a otros sitios.

Sitio oficial: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## Cómo saber si un sitio usa DeepSeek PoW

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-deepseek-pow` (versión de la regla 2.1.1, última actualización 2026-11-04). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (solo corroboración) | Chat completion request, the path the proof of work is issued for |

### Cargas de solicitudes y respuestas

Datos que la página envía a una dirección coincidente o recibe de ella.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) y Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) y Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) y Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) y Chat completion request, the path the proof of work is issued for |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si DeepSeek PoW está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por DeepSeek PoW sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará DeepSeek PoW con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
