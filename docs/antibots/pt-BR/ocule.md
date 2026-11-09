[English](../ocule.md) | [Español](../es/ocule.md) | [Русский](../ru/ocule.md) | [简体中文](../zh-CN/ocule.md) | [日本語](../ja/ocule.md) | **Português (Brasil)** | [Deutsch](../de/ocule.md) | [Français](../fr/ocule.md) | [한국어](../ko/ocule.md)

# Proteção antibot Ocule: como detectar (e o que ela significa para o web scraping)

Ocule é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Ocule, quer detectar o Ocule em um site ou está investigando um web scraping bloqueado pelo Ocule, o primeiro passo é o mesmo: confirmar que é mesmo o Ocule que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Ocule, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Ocule era um serviço de proteção contra bots que depois foi absorvido pela hCaptcha. As páginas que ainda a referenciam costumam ser integrações antigas.

Site oficial: [https://ocule.io/](https://ocule.io/)

## Como saber se um site usa Ocule

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-ocule` (versão da regra 2.1.0, última atualização 2026-10-17). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://proxy\.ocule\.co\.uk/script\.js(?:[?#]\|$)` | 40% | Legacy Ocule loader script (host no longer resolves) |
| `^https://(?!proxy\.)(?:[a-z0-9-]{1,63}\.){0,4}ocule\.co\.uk/` | 20% (apenas corroboração) | Other requests to the legacy ocule.co.uk host (not the loader) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `ocule.co.uk` | 5% | Reference to the legacy Ocule host |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Legacy loader with other Ocule traffic | 60% | Legacy Ocule loader script (host no longer resolves) e Other requests to the legacy ocule.co.uk host (not the loader) |
| Legacy loader referenced in page scripts | 50% | Legacy Ocule loader script (host no longer resolves) e Reference to the legacy Ocule host |
| Legacy Ocule host traffic and reference | 40% | Other requests to the legacy ocule.co.uk host (not the loader) e Reference to the legacy Ocule host |

## Dificuldade

**Alta.** Alta significa que a extensão avalia essa proteção como uma das mais difíceis de superar: ela costuma combinar verificações no lado do cliente com pontuação comportamental ou no servidor.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Ocule estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Ocule sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Ocule com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
