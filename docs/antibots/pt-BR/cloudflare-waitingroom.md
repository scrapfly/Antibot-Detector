[English](../cloudflare-waitingroom.md) | [Español](../es/cloudflare-waitingroom.md) | [Русский](../ru/cloudflare-waitingroom.md) | [简体中文](../zh-CN/cloudflare-waitingroom.md) | [日本語](../ja/cloudflare-waitingroom.md) | **Português (Brasil)** | [Deutsch](../de/cloudflare-waitingroom.md) | [Français](../fr/cloudflare-waitingroom.md) | [한국어](../ko/cloudflare-waitingroom.md)

# Proteção antibot Cloudflare Waiting Room: como detectar (e o que ela significa para o web scraping)

Cloudflare Waiting Room é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Cloudflare Waiting Room, quer detectar o Cloudflare Waiting Room em um site ou está investigando um web scraping bloqueado pelo Cloudflare Waiting Room, o primeiro passo é o mesmo: confirmar que é mesmo o Cloudflare Waiting Room que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Cloudflare Waiting Room, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Cloudflare Waiting Room é um recurso da Cloudflare que coloca os visitantes em uma fila quando um site espera mais tráfego do que sua origem consegue suportar. É uma ferramenta de controle de tráfego, não um detector de bots, mas a página da fila ainda barra scrapers simples.

Site oficial: [https://developers.cloudflare.com/waiting-room/](https://developers.cloudflare.com/waiting-room/)

## Como saber se um site usa Cloudflare Waiting Room

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-cloudflare-waitingroom` (versão da regra 2.1.0, última atualização 2026-10-16). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^__cfwaitingroom$` | 100% | Waiting Room cookie that keeps the visitor's place in the queue |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^server$: ^cloudflare$` | 15% (apenas corroboração) | Served through Cloudflare; CDN delivery, not a queue on its own |
| `^cf-ray$: ^[0-9a-f]{12,20}-[A-Z]{3,4}$` | 15% (apenas corroboração) | Cloudflare request id header; present on any Cloudflare response |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Queue cookie on a Cloudflare response | 85% | Waiting Room cookie that keeps the visitor's place in the queue e Served through Cloudflare; CDN delivery, not a queue on its own |
| Queue cookie with a Cloudflare request id | 80% | Waiting Room cookie that keeps the visitor's place in the queue e Cloudflare request id header; present on any Cloudflare response |
| Queue cookie with Cloudflare server and request id | 100% | Waiting Room cookie that keeps the visitor's place in the queue e Served through Cloudflare; CDN delivery, not a queue on its own e Cloudflare request id header; present on any Cloudflare response |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Cloudflare Waiting Room estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Cloudflare Waiting Room sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Cloudflare Waiting Room com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
