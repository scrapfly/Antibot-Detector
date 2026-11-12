[English](../signifyd.md) | [Español](../es/signifyd.md) | [Русский](../ru/signifyd.md) | [简体中文](../zh-CN/signifyd.md) | [日本語](../ja/signifyd.md) | **Português (Brasil)** | [Deutsch](../de/signifyd.md) | [Français](../fr/signifyd.md) | [한국어](../ko/signifyd.md)

# Proteção antibot Signifyd: como detectar (e o que ela significa para o web scraping)

Signifyd é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Signifyd, quer detectar o Signifyd em um site ou está investigando um web scraping bloqueado pelo Signifyd, o primeiro passo é o mesmo: confirmar que é mesmo o Signifyd que responde às suas requisições. Esta página lista os 9 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Signifyd, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Signifyd é uma plataforma de proteção contra fraude no comércio eletrônico usada por lojas online. O script de perfilamento de dispositivo dela coleta dados do dispositivo e do navegador nas páginas da loja para que a Signifyd avalie o risco de fraude dos pedidos.

Site oficial: [https://www.signifyd.com/](https://www.signifyd.com/)

## Como saber se um site usa Signifyd

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-signifyd` (versão da regra 2.0.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://cdn-scripts\.signifyd\.com/(?:api\|bigcommerce\|shopify)/script-tag\.js(?:[?#]\|$)` | 100% | Signifyd device profiling script script-tag.js on cdn-scripts.signifyd.com (standard, BigCommerce or Shopify) |
| `^https://cdn-scripts\.signifyd\.com/(?:api/company_toolkit\|o/(?:loader\|lite)\|bigcommerce/conversion-tracking)\.js(?:[?#]\|$)` | 100% | Other Signifyd scripts on cdn-scripts.signifyd.com (company_toolkit.js, loader.js, lite.js, BigCommerce conversion-tracking.js) |
| `^https://dp\.signifyd\.com/fp-web(?:[?#]\|$)` | 100% | Device profile sent to dp.signifyd.com/fp-web |
| `^https?://[^/?#]+/api/script-tag\.js(?:[?#]\|$)` | 40% (apenas corroboração) | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only |
| `^https?://[^/?#]+/o/lite\.js(?:[?#]\|$)` | 30% (apenas corroboração) | First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only |
| `^https?://[^/?#]+/fp-web(?:[?#]\|$)` | 30% (apenas corroboração) | First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `signifyd.pageView (typeof function)` | 60% | signifyd.pageView method the Signifyd script exposes for single-page applications |
| `sigScriptLoader (typeof object)` | 60% | sigScriptLoader object of the Signifyd script, with its isInitialized flag |

### Elementos do DOM

Elementos encontrados por seletor CSS.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `script#script-tag-api[data-order-session-id], script#sig-api[data-order-session-id], script#sig-bc[data-store-id]` | 60% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Signifyd script tag served from the site with its profiling routes | 100% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute e First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only e (First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only ou First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only) |
| Signifyd script tag with its runtime | 95% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute e (signifyd.pageView method the Signifyd script exposes for single-page applications ou sigScriptLoader object of the Signifyd script, with its isInitialized flag) |
| All three Signifyd routes served from the site | 85% | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only e First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only e First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |
| Signifyd loader and page-view method | 85% | signifyd.pageView method the Signifyd script exposes for single-page applications e sigScriptLoader object of the Signifyd script, with its isInitialized flag |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Signifyd estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Signifyd sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Signifyd com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
