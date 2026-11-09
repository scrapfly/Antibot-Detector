[English](../threatmetrix.md) | **Español** | [Русский](../ru/threatmetrix.md) | [简体中文](../zh-CN/threatmetrix.md) | [日本語](../ja/threatmetrix.md) | [Português (Brasil)](../pt-BR/threatmetrix.md) | [Deutsch](../de/threatmetrix.md) | [Français](../fr/threatmetrix.md) | [한국어](../ko/threatmetrix.md)

# Protección anti-bot ThreatMetrix: cómo detectarla (y qué implica para el web scraping)

ThreatMetrix es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de ThreatMetrix, quieres detectar ThreatMetrix en un sitio o investigas un web scraping bloqueado por ThreatMetrix, el primer paso es el mismo: confirmar que ThreatMetrix es realmente quien responde a tus solicitudes. Esta página enumera las 6 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de ThreatMetrix, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

ThreatMetrix es un servicio de identificación de dispositivos y prevención del fraude que ahora pertenece a LexisNexis Risk Solutions. Perfila el dispositivo del visitante y envía el resultado a un motor de decisión.

Sitio oficial: [https://www.threatmetrix.com/](https://www.threatmetrix.com/)

## Cómo saber si un sitio usa ThreatMetrix

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-threatmetrix` (versión de la regla 2.3.0, última actualización 2026-10-17). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=` | 100% | ThreatMetrix profiling tag (fp/tags.js?org_id=...) |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/(?:check\.js\|clear\.png\|sym\.map\|ls_fp\.html)` | 100% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| `^https?://[^/?#]+/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=[A-Za-z0-9]{6,12}&(?:[^#]*&)?session_id=` | 50% (solo corroboración) | First-party (CNAME) ThreatMetrix tag with org_id and session_id |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `tmx_(?:profiling_started\|run_page_fingerprinting)` | 10% | ThreatMetrix profiling globals in scripts |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `tmx_profiling_started (typeof boolean)` | 70% | ThreatMetrix profiling flag |
| `tmx_run_page_fingerprinting (typeof function)` | 60% | ThreatMetrix page fingerprint function |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Profiling tag with its runtime | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) o First-party (CNAME) ThreatMetrix tag with org_id and session_id) y (ThreatMetrix profiling flag o ThreatMetrix page fingerprint function o ThreatMetrix profiling globals in scripts) |
| Profiling tag with its follow-up resources | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) o First-party (CNAME) ThreatMetrix tag with org_id and session_id) y ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| Profiling resource with its runtime | 85% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) y (ThreatMetrix profiling flag o ThreatMetrix page fingerprint function) |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si ThreatMetrix está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por ThreatMetrix sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará ThreatMetrix con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
