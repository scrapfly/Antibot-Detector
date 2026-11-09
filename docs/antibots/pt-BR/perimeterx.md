[English](../perimeterx.md) | [Español](../es/perimeterx.md) | [Русский](../ru/perimeterx.md) | [简体中文](../zh-CN/perimeterx.md) | [日本語](../ja/perimeterx.md) | **Português (Brasil)** | [Deutsch](../de/perimeterx.md) | [Français](../fr/perimeterx.md) | [한국어](../ko/perimeterx.md)

# Proteção antibot HUMAN (PerimeterX): como detectar (e o que ela significa para o web scraping)

HUMAN (PerimeterX) é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o HUMAN (PerimeterX), quer detectar o HUMAN (PerimeterX) em um site ou está investigando um web scraping bloqueado pelo HUMAN (PerimeterX), o primeiro passo é o mesmo: confirmar que é mesmo o HUMAN (PerimeterX) que responde às suas requisições. Esta página lista os 12 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do HUMAN (PerimeterX), o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A PerimeterX agora faz parte da HUMAN Security. O bot defender dela coloca um script na página e pontua os visitantes por comportamento e sinais do dispositivo, e pode responder com um desafio do tipo pressionar e segurar.

Site oficial: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## Como saber se um site usa HUMAN (PerimeterX)

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-perimeterx` (versão da regra 2.3.1, última atualização 2026-10-30). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (apenas corroboração) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (apenas corroboração) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (apenas corroboração) | Optional PerimeterX init callback defined by the site |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID ou First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) ou PerimeterX application ID ou PerimeterX collector endpoint) e (PerimeterX risk token cookie (_px2 or _px3) ou PerimeterX first-party server cookie ou PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | pelo menos 2 de: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host e (PerimeterX application ID ou Script assigning the PerimeterX app ID (window._pxAppId) ou Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) e (PerimeterX application ID ou Script assigning the PerimeterX app ID (window._pxAppId) ou Optional PerimeterX init callback defined by the site) |

## Dificuldade

**Alta.** Alta significa que a extensão avalia essa proteção como uma das mais difíceis de superar: ela costuma combinar verificações no lado do cliente com pontuação comportamental ou no servidor.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o HUMAN (PerimeterX) estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo HUMAN (PerimeterX) sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o HUMAN (PerimeterX) com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
