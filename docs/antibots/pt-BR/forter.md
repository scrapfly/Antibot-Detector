[English](../forter.md) | [Español](../es/forter.md) | [Русский](../ru/forter.md) | [简体中文](../zh-CN/forter.md) | [日本語](../ja/forter.md) | **Português (Brasil)** | [Deutsch](../de/forter.md) | [Français](../fr/forter.md) | [한국어](../ko/forter.md)

# Proteção antibot Forter: como detectar (e o que ela significa para o web scraping)

Forter é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Forter, quer detectar o Forter em um site ou está investigando um web scraping bloqueado pelo Forter, o primeiro passo é o mesmo: confirmar que é mesmo o Forter que responde às suas requisições. Esta página lista os 7 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Forter, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Forter é uma fornecedora de prevenção de fraude para o comércio online. O script dela cria uma impressão digital do navegador, e o site envia o token resultante nas decisões de checkout e de login.

Site oficial: [https://www.forter.com/](https://www.forter.com/)

## Como saber se um site usa Forter

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-forter` (versão da regra 2.0.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^forterToken$` | 90% | forterToken cookie set by the Forter script |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://[0-9a-f]{12}\.cdn4\.forter\.com/sns?/[0-9a-f]{12}/(?:[^?#]*/)?script\.js(?:[?#]\|$)` | 100% | Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) |
| `^https://(?:[0-9a-f-]+\.)?cdn\d*\.forter\.com/(?:events\|[^?#]*\.json)(?:[?#]\|$)` | 100% | Forter collection request to a forter.com CDN host (prop.json, wpt.json, events) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `\bftr__(?:startScriptLoad\|config)\b` | 20% (apenas corroboração) | Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config) |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `ftr__config (typeof object)` | 60% | ftr__config object set by the Forter loader snippet |
| `ftr__startScriptLoad (typeof number)` | 50% (apenas corroboração) | ftr__startScriptLoad timestamp set by the Forter loader snippet |
| `ftr__JSON3 (typeof object)` | 50% (apenas corroboração) | ftr__JSON3 object set by the Forter script |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Forter script with its token cookie or config | 100% | (Forter script loaded from a site-specific cdn4.forter.com host (sn/<site id>/script.js) ou Forter collection request to a forter.com CDN host (prop.json, wpt.json, events)) e (forterToken cookie set by the Forter script ou ftr__config object set by the Forter loader snippet) |
| forterToken cookie with the Forter runtime | 100% | forterToken cookie set by the Forter script e (ftr__config object set by the Forter loader snippet ou ftr__startScriptLoad timestamp set by the Forter loader snippet ou ftr__JSON3 object set by the Forter script ou Forter loader snippet globals in scripts (ftr__startScriptLoad, ftr__config)) |
| Forter loader globals together | 85% | ftr__config object set by the Forter loader snippet e (ftr__startScriptLoad timestamp set by the Forter loader snippet ou ftr__JSON3 object set by the Forter script) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Forter estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Forter sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Forter com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
