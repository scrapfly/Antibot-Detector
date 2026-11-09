[English](../kount.md) | **Español** | [Русский](../ru/kount.md) | [简体中文](../zh-CN/kount.md) | [日本語](../ja/kount.md) | [Português (Brasil)](../pt-BR/kount.md) | [Deutsch](../de/kount.md) | [Français](../fr/kount.md) | [한국어](../ko/kount.md)

# Protección anti-bot Kount: cómo detectarla (y qué implica para el web scraping)

Kount es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Kount, quieres detectar Kount en un sitio o investigas un web scraping bloqueado por Kount, el primer paso es el mismo: confirmar que Kount es realmente quien responde a tus solicitudes. Esta página enumera las 4 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Kount, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Kount, parte de Equifax, es una empresa de prevención del fraude en pagos. Su Device Data Collector recoge información del navegador que el backend del comercio envía a Kount para una decisión de riesgo.

Sitio oficial: [https://kount.com/](https://kount.com/)

## Cómo saber si un sitio usa Kount

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-kount` (versión de la regla 2.0.0, última actualización 2026-10-26). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://(?:ssl\|tst)\.kaptcha\.com/collect/sdk\?(?:[^#]*&)?m=[0-9]{3,}(?:[&#]\|$)` | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) |
| `^https://(?:ssl\|tst)\.kaptcha\.com/(?:cs/(?:config\|generatecookie\|storecookie\|location)\|session/[A-Za-z0-9_-]+\|logo\.htm\|fin)(?:[?#]\|$)` | 100% | Kount Web SDK request to the vendor kaptcha.com collector |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `kaxsdc` | 20% | Script reference to the kaxsdc class that triggers Kount data collection |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `ka.ClientSDK (typeof function)` | 60% | ka.ClientSDK class of the Kount data collector |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Kount collector script with its class or trigger | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) y (ka.ClientSDK class of the Kount data collector o Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount collector request with its script or class | 95% | Kount Web SDK request to the vendor kaptcha.com collector y (Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) o ka.ClientSDK class of the Kount data collector o Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount class with its trigger | 80% | ka.ClientSDK class of the Kount data collector y Script reference to the kaxsdc class that triggers Kount data collection |

## Dificultad

**Media.** Media significa que la extensión considera esta protección un obstáculo real: espera comprobaciones sobre el navegador, sobre los detalles de la solicitud o sobre ambos, y espera que cambien con el tiempo.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Kount está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Kount sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Kount con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
