[English](../meetrics.md) | [Español](../es/meetrics.md) | [Русский](../ru/meetrics.md) | [简体中文](../zh-CN/meetrics.md) | [日本語](../ja/meetrics.md) | **Português (Brasil)** | [Deutsch](../de/meetrics.md) | [Français](../fr/meetrics.md) | [한국어](../ko/meetrics.md)

# Proteção antibot Meetrics Check: como detectar (e o que ela significa para o web scraping)

Meetrics Check é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Meetrics Check, quer detectar o Meetrics Check em um site ou está investigando um web scraping bloqueado pelo Meetrics Check, o primeiro passo é o mesmo: confirmar que é mesmo o Meetrics Check que responde às suas requisições. Esta página lista os 4 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Meetrics Check, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Meetrics é uma empresa de medição de mídia que ofereceu tags de medição de visibilidade de anúncios e de fraude publicitária. O detector sinaliza integrações antigas que ainda referenciam o script dela, que pode não funcionar mais.

Site oficial: [https://www.meetrics.com/en/](https://www.meetrics.com/en/)

## Como saber se um site usa Meetrics Check

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-meetrics` (versão da regra 2.1.0, última atualização 2026-10-17). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}mxcdn\.net/bb-mx/serve/mtrcs_[0-9]+\.js(?:[?#]\|$)` | 40% | Legacy Meetrics tag (mxcdn.net, now parked) |
| `^https://(?:[a-z0-9-]{1,63}\.){0,4}meetrics\.(?:com\|net)/` | 20% (apenas corroboração) | Legacy meetrics.com/.net host |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `meetricsGlobal` | 5% | Meetrics global reference in scripts |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `meetricsGlobal (typeof object)` | 40% | Meetrics global object |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Legacy tag with its runtime | 60% | Legacy Meetrics tag (mxcdn.net, now parked) e Meetrics global object |
| Meetrics host traffic with its runtime | 50% | Legacy meetrics.com/.net host e (Meetrics global object ou Meetrics global reference in scripts) |
| Legacy tag referenced in page scripts | 45% | Legacy Meetrics tag (mxcdn.net, now parked) e Meetrics global reference in scripts |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Meetrics Check estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Meetrics Check sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Meetrics Check com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
