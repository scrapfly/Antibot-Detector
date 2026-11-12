[English](../reblaze.md) | [Español](../es/reblaze.md) | [Русский](../ru/reblaze.md) | [简体中文](../zh-CN/reblaze.md) | [日本語](../ja/reblaze.md) | **Português (Brasil)** | [Deutsch](../de/reblaze.md) | [Français](../fr/reblaze.md) | [한국어](../ko/reblaze.md)

# Proteção antibot Reblaze: como detectar (e o que ela significa para o web scraping)

Reblaze é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Reblaze, quer detectar o Reblaze em um site ou está investigando um web scraping bloqueado pelo Reblaze, o primeiro passo é o mesmo: confirmar que é mesmo o Reblaze que responde às suas requisições. Esta página lista os 8 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Reblaze, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Reblaze é uma plataforma de segurança web em nuvem que inclui um firewall de aplicações web, proteção contra DDoS e gerenciamento de bots.

Site oficial: [https://www.reblaze.com/](https://www.reblaze.com/)

## Como saber se um site usa Reblaze

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-reblaze` (versão da regra 2.2.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^rbzid$` | 80% | Reblaze visitor id cookie |
| `^rbzsessionid$` | 100% | Reblaze session cookie |
| `^rbz(?!id$\|sessionid$)[a-z0-9_]{2,20}$` | 30% (apenas corroboração) | Other rbz* cookies (not rbzid or rbzsessionid) |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9_-]{3,40}\.ac_v2\.lib\.js(?:[?#]\|$)` | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) |
| `^https?://[^/?#]+/c3650cdf-216a-4ba2-80b0-9d6c540b105e58d2670b-ea0f-484e-b88c-0e2c1499ec9bd71e4b42-8570-44e3-89b6-845326fa43b6(?:[?#]\|$)` | 100% | Reblaze passive challenge script at its fixed first-party path |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `rbzns` | 10% | Reblaze namespace in page scripts |
| `bereshit` | 20% (apenas corroboração) | Reblaze challenge config key (rbzns.bereshit) |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `rbzns (typeof object)` | 75% | Reblaze namespace object (window.rbzns) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Challenge library with its namespace | 100% | Reblaze active-challenge library (<name>.ac_v2.lib.js) e (Reblaze namespace object (window.rbzns) ou Reblaze namespace in page scripts ou Reblaze challenge config key (rbzns.bereshit)) |
| Reblaze cookies with its namespace or library | 90% | (Reblaze visitor id cookie ou Reblaze session cookie ou Other rbz* cookies (not rbzid or rbzsessionid)) e (Reblaze namespace object (window.rbzns) ou Reblaze active-challenge library (<name>.ac_v2.lib.js) ou Reblaze namespace in page scripts) |
| Reblaze id and session cookies | 85% | Reblaze visitor id cookie e (Reblaze session cookie ou Other rbz* cookies (not rbzid or rbzsessionid)) |
| Reblaze namespace running with its challenge config | 90% | Reblaze namespace object (window.rbzns) e Reblaze challenge config key (rbzns.bereshit) |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Reblaze estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Reblaze sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Reblaze com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
