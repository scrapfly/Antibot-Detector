[English](../openai-sentinel.md) | **Español** | [Русский](../ru/openai-sentinel.md) | [简体中文](../zh-CN/openai-sentinel.md) | [日本語](../ja/openai-sentinel.md) | [Português (Brasil)](../pt-BR/openai-sentinel.md) | [Deutsch](../de/openai-sentinel.md) | [Français](../fr/openai-sentinel.md) | [한국어](../ko/openai-sentinel.md)

# Protección anti-bot OpenAI Sentinel: cómo detectarla (y qué implica para el web scraping)

OpenAI Sentinel es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de OpenAI Sentinel, quieres detectar OpenAI Sentinel en un sitio o investigas un web scraping bloqueado por OpenAI Sentinel, el primer paso es el mismo: confirmar que OpenAI Sentinel es realmente quien responde a tus solicitudes. Esta página enumera las 11 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de OpenAI Sentinel, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Sentinel es el nombre de la capa antiabuso que usan ChatGPT y el inicio de sesión de OpenAI. Emite desafíos al navegador antes de algunas solicitudes. Protege los servicios propios de OpenAI y no es un producto para otros sitios.

Sitio oficial: [https://chatgpt.com/](https://chatgpt.com/)

## Cómo saber si un sitio usa OpenAI Sentinel

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-openai-sentinel` (versión de la regla 2.1.1, última actualización 2026-11-04). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements(?:/[a-z]{3,12})?(?:[?#]\|$)` | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/sdk\.js(?:[?#]\|$)` | 100% | Sentinel SDK loader (/backend-api/sentinel/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/sentinel/[0-9a-z]{6,24}/sdk\.js(?:[?#]\|$)` | 100% | Versioned Sentinel SDK (/sentinel/<build>/sdk.js) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/frame\.html(?:[?#]\|$)` | 100% | Hidden Sentinel frame (/backend-api/sentinel/frame.html) |
| `^https://(?:sentinel\.openai\.com\|chatgpt\.com)/backend-api/sentinel/req(?:[?#]\|$)` | 100% | Sentinel token request sent by the SDK (/backend-api/sentinel/req) |
| `^https://chatgpt\.com/(?:[a-z0-9-]{3,20}/)?assets/(?:[a-z]{2,12}-){0,4}sentinel(?:-[a-z]{2,12}){0,3}-[A-Za-z0-9_-]{8}\.js(?:[?#]\|$)` | 70% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `SentinelSDK (typeof object)` | 75% | Sentinel SDK object (window.SentinelSDK) |

### Cargas de solicitudes y respuestas

Datos que la página envía a una dirección coincidente o recibe de ella.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/ ; body "p"\s*:\s*"gAAAAAC` | 100% | Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| `URL ^https://chatgpt\.com/[a-z0-9-]{3,20}/sentinel/chat-requirements/finalize(?:[?#]\|$) ; body "proofofwork"\s*:\s*"gAAAAAB` | 100% | Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "proofofwork"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) |
| `URL ^https://(?:sentinel\.openai\.com\|chatgpt\.com)/[a-z0-9-]{3,20}/sentinel/(?:chat-requirements(?:/prepare)?\|req)(?:[?#]\|$) ; response "so"\s*:\s*\{\s*"required"\s*:\s*true` | 100% | Sentinel response asking for session telemetry (so.required: true) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Chat-requirements request with its requirements token | 100% | ChatGPT Sentinel chat-requirements endpoint (prepare or finalize), which hands out the proof of work y Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint |
| Proof of work asked for and answered | 100% | Sentinel response asking for a proof of work (proofofwork.required: true) y Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize |
| Sentinel SDK with its frame or token request | 100% | (Sentinel SDK loader (/backend-api/sentinel/sdk.js) o Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) y (Hidden Sentinel frame (/backend-api/sentinel/frame.html) o Sentinel token request sent by the SDK (/backend-api/sentinel/req)) |
| Sentinel SDK object with its script | 90% | Sentinel SDK object (window.SentinelSDK) y (Sentinel SDK loader (/backend-api/sentinel/sdk.js) o Versioned Sentinel SDK (/sentinel/<build>/sdk.js)) |
| ChatGPT Sentinel scripts with Sentinel traffic | 90% | ChatGPT's own Sentinel scripts (assets/…sentinel…-<hash>.js) y (Sentinel requirements token (p: gAAAAAC…) posted to a Sentinel endpoint o Solved proof of work (proofofwork: gAAAAAB…) sent to chat-requirements/finalize o Sentinel response asking for a proof of work (proofofwork.required: true)) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si OpenAI Sentinel está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por OpenAI Sentinel sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará OpenAI Sentinel con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
