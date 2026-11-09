[English](../seon.md) | **Español** | [Русский](../ru/seon.md) | [简体中文](../zh-CN/seon.md) | [日本語](../ja/seon.md) | [Português (Brasil)](../pt-BR/seon.md) | [Deutsch](../de/seon.md) | [Français](../fr/seon.md) | [한국어](../ko/seon.md)

# Protección anti-bot SEON: cómo detectarla (y qué implica para el web scraping)

SEON es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de SEON, quieres detectar SEON en un sitio o investigas un web scraping bloqueado por SEON, el primer paso es el mismo: confirmar que SEON es realmente quien responde a tus solicitudes. Esta página enumera las 7 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de SEON, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

SEON es una empresa de prevención del fraude. Su agente JavaScript recoge señales del dispositivo y de la red que alimentan su puntuación de riesgo.

Sitio oficial: [https://seon.io/](https://seon.io/)

## Cómo saber si un sitio usa SEON

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-seon` (versión de la regla 2.0.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://cdn\.(?:seondf\|dfsdk\|deviceinf\|seonintelligence)\.com/js/v\d+/agent(?:\.umd)?\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts |
| `^https://cdn\.seon\.io/js/v\d+/agent\.js(?:[?#]\|$)` | 100% | SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host |
| `^https://[0-9a-f]{16,64}\.seondnsresolve\.com/` | 100% | SEON agent network probe to a seondnsresolve.com host |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `\bseon\.(?:getSession\|getBase64Session\|config)\s*\(` | 20% (solo corroboración) | SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `seon.getSession (typeof function)` | 60% | seon.getSession function of the SEON v6 agent |
| `seon.getBase64Session (typeof function)` | 60% | seon.getBase64Session function of the SEON v5 agent |
| `webpackChunkseon_javascript_sdk (exists)` | 50% (solo corroboración) | webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| SEON agent from its host with its runtime | 100% | (SEON JavaScript agent (agent.umd.js) on one of the vendor CDN hosts o SEON JavaScript agent v4/v5 on the vendor cdn.seon.io host o SEON agent network probe to a seondnsresolve.com host) y (seon.getSession function of the SEON v6 agent o seon.getBase64Session function of the SEON v5 agent o webpackChunkseon_javascript_sdk global left by the SEON v5 agent) |
| SEON agent with its calls | 85% | (seon.getSession function of the SEON v6 agent o seon.getBase64Session function of the SEON v5 agent o webpackChunkseon_javascript_sdk global left by the SEON v5 agent) y SEON agent calls in scripts (seon.getSession, seon.getBase64Session, seon.config) |
| SEON v5 agent function with its runtime | 80% | seon.getBase64Session function of the SEON v5 agent y webpackChunkseon_javascript_sdk global left by the SEON v5 agent |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si SEON está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por SEON sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará SEON con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
