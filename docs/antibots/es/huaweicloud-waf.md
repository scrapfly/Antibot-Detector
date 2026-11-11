[English](../huaweicloud-waf.md) | **Español** | [Русский](../ru/huaweicloud-waf.md) | [简体中文](../zh-CN/huaweicloud-waf.md) | [日本語](../ja/huaweicloud-waf.md) | [Português (Brasil)](../pt-BR/huaweicloud-waf.md) | [Deutsch](../de/huaweicloud-waf.md) | [Français](../fr/huaweicloud-waf.md) | [한국어](../ko/huaweicloud-waf.md)

# Protección anti-bot Huawei Cloud WAF: cómo detectarla (y qué implica para el web scraping)

Huawei Cloud WAF es una capa de protección contra bots o contra abusos que algunos sitios web colocan delante de sus páginas. Si buscas un bypass de Huawei Cloud WAF, quieres detectar Huawei Cloud WAF en un sitio o investigas un web scraping bloqueado por Huawei Cloud WAF, el primer paso es el mismo: confirmar que Huawei Cloud WAF es realmente quien responde a tus solicitudes. Esta página enumera las 3 señales públicas que la extensión Scrapfly Antibot Detector usa para reconocer la detección de bots de Huawei Cloud WAF, con qué fuerza apunta cada una hacia ella y qué suele significar para un cliente automatizado.

## Qué es

Huawei Cloud WAF es el firewall de aplicaciones web de Huawei Cloud. En un sitio conectado añade cookies de sesión a las peticiones de los visitantes, que sus reglas de protección contra ataques CC y anti-crawler usan para contar y seguir las peticiones.

Sitio oficial: [https://www.huaweicloud.com/intl/en-us/product/waf.html](https://www.huaweicloud.com/intl/en-us/product/waf.html)

## Cómo saber si un sitio usa Huawei Cloud WAF

Estas señales se generan a partir de las reglas de detección de la propia extensión para `detect-huaweicloud-waf` (versión de la regla 2.0.0, última actualización 2026-11-11). Una señal es solo un indicio: la confianza es el grado de seguridad que tiene la extensión cuando ve esa señal concreta. Las señales marcadas como «solo corroboración» nunca cuentan por sí solas, porque otros productos también pueden generarlas.

### Cookies

Nombres de cookies (y valores, cuando se compara uno) establecidas en la página. Los patrones son expresiones regulares, salvo que sean palabras simples.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^HWWAFSESID$` | 90% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| `^HWWAFSESTIME$` | 90% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |

### Cabeceras de respuesta

Cabeceras de respuesta HTTP que devuelven la página o sus solicitudes.

| Señal | Confianza | Qué indica |
| --- | --- | --- |
| `^server$: HuaweiCloudWAF` | 40% (solo corroboración) | Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

### Combinaciones

Algunas señales puntúan más juntas que por separado. La extensión también informa de estas combinaciones.

| Combinación | Confianza | Requiere |
| --- | --- | --- |
| Both WAF session cookies | 100% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) y HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| Session ID cookie with the WAF server header | 95% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) y Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |
| Session timestamp cookie with the WAF server header | 95% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) y Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

## Dificultad

**Baja.** Baja significa que la extensión considera esta protección un obstáculo ligero: normalmente solo filtra clientes simples, y un navegador real o una solicitud bien formada que imite a un navegador suele pasar.

La valoración es una regla empírica de la propia extensión, no una declaración del proveedor, y la configuración de un sitio puede hacer que el mismo producto sea más fácil o más difícil de superar.

## Qué implica para el scraping

Si Huawei Cloud WAF está presente, una solicitud que no parezca una sesión de navegador real y coherente puede recibir un desafío, sufrir retrasos o ser rechazada, y la respuesta puede ser una página de desafío o de bloqueo en lugar del contenido que querías. Lo que ocurre exactamente depende de cómo haya configurado el producto el propietario del sitio, algo que puede variar de un sitio a otro y cambiar sin previo aviso. Considera una detección como un motivo para examinar la respuesta que realmente recibes, no como una garantía de bloqueo.

Para hacer scraping de páginas protegidas por Huawei Cloud WAF sin mantener tú mismo las soluciones alternativas, consulta [documentación de Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) de Scrapfly y la [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started). Haz scraping solo de lo que tengas permiso para obtener, y respeta los términos del sitio y las reglas de robots.

## Detéctalo con la extensión

Instala gratis [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) para Chrome, visita la página y el popup mostrará Huawei Cloud WAF con su confianza, su dificultad y las señales exactas que coincidieron. Más información en el [README del proyecto](../../README.es.md), o consulta [todas las protecciones anti-bot que detecta la extensión](README.md).
