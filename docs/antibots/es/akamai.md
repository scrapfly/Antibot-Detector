[English](../akamai.md) | **Español** | [Русский](../ru/akamai.md) | [简体中文](../zh-CN/akamai.md) | [日本語](../ja/akamai.md) | [Português (Brasil)](../pt-BR/akamai.md) | [Deutsch](../de/akamai.md) | [Français](../fr/akamai.md) | [한국어](../ko/akamai.md)

# Protección anti-bot Akamai Bot Manager: cómo detectarla (y qué implica para el web scraping)

Akamai Bot Manager es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Akamai Bot Manager, quieres detectar Akamai Bot Manager en un sitio o investigas un web scraping bloqueado por Akamai Bot Manager, el primer paso es el mismo: confirmar que Akamai Bot Manager es realmente quien responde a tus solicitudes. Esta página enumera las 20 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Akamai Bot Manager, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Akamai Bot Manager es el producto de gestión de bots de Akamai Technologies, una empresa de CDN y seguridad. Se vende a grandes sitios como parte de la plataforma edge de Akamai y busca distinguir entre personas, bots legítimos y automatización abusiva.

Sitio oficial: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## Cómo saber si un sitio usa Akamai Bot Manager

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-akamai` (versión de la regla 2.3.0, última actualización 2026-11-12). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|s\|so\|lso)$` | 30% (solo corroboración) | Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only |
| `^bm_sv$` | 60% | Bot Manager cookie bm_sv, named in Akamai's cookie documentation |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (solo corroboración) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (solo corroboración) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### URL de scripts y solicitudes

Direcciones de scripts, marcos y solicitudes que carga la página. Son patrones que se comparan con la dirección completa.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (solo corroboración) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### Contenido de la página y de los scripts

Texto que se encuentra dentro de la página o de sus scripts.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### Variables globales de JavaScript (window)

Propiedades que el contexto JavaScript de la propia página expone en `window`.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### Cargas de solicitudes y respuestas

Datos que la página envía a una dirección coincidente o recibe de ella.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape y (Bot Manager session cookie (hash~token) o Bot Manager edge session cookie o Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only o Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ o Bot Manager sensor object (bmak) o Bot Manager sensor_data POST body) y (Bot Manager sensor cookie in its documented hash~state~token shape o Bot Manager session cookie (hash~token) o Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script y Bot Manager sensor cookie in its documented hash~state~token shape y (Akamai edge server header; CDN delivery, not Bot Manager on its own o Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own o Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint o SBSD challenge POST to the sbsd endpoint) y SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own o Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) y (Bot Manager sensor cookie in its documented hash~state~token shape o Bot Manager session cookie (hash~token) o Bot Manager edge session cookie o Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie y (Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only o Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ y (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) o Bot Manager sensor cookie in its documented hash~state~token shape o Bot Manager session cookie (hash~token)) |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Akamai Bot Manager está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Akamai Bot Manager sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Akamai Bot Manager con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
