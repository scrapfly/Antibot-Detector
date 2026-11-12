[English](../perimeterx.md) | **Español** | [Русский](../ru/perimeterx.md) | [简体中文](../zh-CN/perimeterx.md) | [日本語](../ja/perimeterx.md) | [Português (Brasil)](../pt-BR/perimeterx.md) | [Deutsch](../de/perimeterx.md) | [Français](../fr/perimeterx.md) | [한국어](../ko/perimeterx.md)

# Protección anti-bot HUMAN (PerimeterX): cómo detectarla (y qué implica para el web scraping)

HUMAN (PerimeterX) es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de HUMAN (PerimeterX), quieres detectar HUMAN (PerimeterX) en un sitio o investigas un web scraping bloqueado por HUMAN (PerimeterX), el primer paso es el mismo: confirmar que HUMAN (PerimeterX) es realmente quien responde a tus solicitudes. Esta página enumera las 22 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de HUMAN (PerimeterX), con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

PerimeterX ahora forma parte de HUMAN Security. Su bot defender coloca un script en la página y puntúa a los visitantes según su comportamiento y las señales del dispositivo, y puede responder con un desafío de tipo mantener pulsado.

Sitio oficial: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## Cómo saber si un sitio usa HUMAN (PerimeterX)

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-perimeterx` (versión de la regla 2.4.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (solo corroboración) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| `^(?:_pxmvid\|_pxttld\|_pxwvm\|_pxmd\|_pxda\|_pxac)$` | 60% | Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac) |
| `^__pxvid$` | 60% | HUMAN Code Defender visitor cookie (__pxvid) |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (solo corroboración) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |
| `^https://(?:[a-z0-9-]+\.)+(?:px-cloud\.net\|px-cdn\.net\|px-client\.net\|pxchk\.net\|perimeterx\.net\|hsprotect\.net)(?:[/?#:]\|$)` | 100% | Request to a HUMAN (PerimeterX) sensor, collector or challenge host |
| `^https?://[^/?#]+/(?:PX)?[A-Za-z0-9]{8}/xhr/api/v[0-9]/collector(?:[/?#]\|$)` | 85% | First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector) |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/init\.js(?:[?#]\|$)` | 30% (solo corroboración) | First-party init.js under an app-ID path without the PX prefix; corroboration only |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (solo corroboración) | Optional PerimeterX init callback defined by the site |
| `_pxUuid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxVid (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxBlockedUrl (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |
| `_pxJsClientSrc (typeof string)` | 60% | HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) |

### Elementos del DOM

Elementos que coinciden con un selector CSS.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `div#px-captcha` | 60% | HUMAN challenge container (div#px-captcha) |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID o First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) o PerimeterX application ID o PerimeterX collector endpoint) y (PerimeterX risk token cookie (_px2 or _px3) o PerimeterX first-party server cookie o PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | al menos 2 de: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host y (PerimeterX application ID o Script assigning the PerimeterX app ID (window._pxAppId) o Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) y (PerimeterX application ID o Script assigning the PerimeterX app ID (window._pxAppId) o Optional PerimeterX init callback defined by the site) |
| First-party HUMAN sensor with its app ID or cookies | 95% | (First-party init.js under an app-ID path without the PX prefix; corroboration only o First-party HUMAN collector under the app ID (/<appid>/xhr/api/v1/collector)) y (PerimeterX application ID o Script assigning the PerimeterX app ID (window._pxAppId) o Optional PerimeterX init callback defined by the site o Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) o Other cookies HUMAN documents for its sensor (_pxmvid, _pxttld, _pxwvm, _pxmd, _pxda, _pxac)) |
| HUMAN block page with its challenge | 95% | (HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) o HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) o HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) o HUMAN block page variable (_pxUuid, _pxVid, _pxBlockedUrl, _pxJsClientSrc) o HUMAN challenge container (div#px-captcha)) y (PerimeterX challenge (Press & Hold) script host o First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) o Request to a HUMAN (PerimeterX) sensor, collector or challenge host) |

## Dificultad

**Alta.** Alta significa que la extensión considera esta protección una de las más difíciles de superar: suele combinar comprobaciones en el cliente con una puntuación basada en el comportamiento o en el servidor.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si HUMAN (PerimeterX) está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por HUMAN (PerimeterX) sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará HUMAN (PerimeterX) con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
