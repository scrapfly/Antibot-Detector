[English](../vercel.md) | [Español](../es/vercel.md) | [Русский](../ru/vercel.md) | [简体中文](../zh-CN/vercel.md) | [日本語](../ja/vercel.md) | **Português (Brasil)** | [Deutsch](../de/vercel.md) | [Français](../fr/vercel.md) | [한국어](../ko/vercel.md)

# Proteção antibot Vercel Firewall: como detectar (e o que ela significa para o web scraping)

Vercel Firewall é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Vercel Firewall, quer detectar o Vercel Firewall em um site ou está investigando um web scraping bloqueado pelo Vercel Firewall, o primeiro passo é o mesmo: confirmar que é mesmo o Vercel Firewall que responde às suas requisições. Esta página lista os 9 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Vercel Firewall, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Vercel Firewall é a camada de segurança da plataforma de hospedagem Vercel. Inclui regras configuráveis, uma página de desafio do Attack Mode e uma verificação BotID.

Site oficial: [https://vercel.com/docs/vercel-firewall](https://vercel.com/docs/vercel-firewall)

## Como saber se um site usa Vercel Firewall

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-vercel` (versão da regra 2.0.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-vercel-mitigated$: ^challenge$` | 100% | x-vercel-mitigated: challenge, the Vercel Firewall served its challenge |
| `^x-vercel-mitigated$: ^deny$` | 100% | x-vercel-mitigated: deny, the Vercel Firewall blocked the request |
| `^x-vercel-challenge-(?:token\|solution\|version)$` | 60% | x-vercel-challenge-token header of the Vercel Security Checkpoint |
| `^server$: ^Vercel$` | 15% (apenas corroboração) | Hosted on Vercel; hosting, not bot protection on its own |
| `^x-vercel-id$` | 15% (apenas corroboração) | Vercel request id header; present on any Vercel response |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/vercel/security/static/challenge(?:\.v[0-9]+)?(?:\.min)?\.js(?:[?#]\|$)` | 90% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ |
| `^https?://[^/?#]+/\.well-known/vercel/security/request-challenge(?:[?#]\|$)` | 50% (apenas corroboração) | Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge |
| `^https?://[^/?#]+/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/(?:a-4-a/c\|p)\.js(?:[?#]\|$)` | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3` | 30% | BotID path written in the page's scripts |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Vercel Security Checkpoint on a Vercel response | 100% | (x-vercel-mitigated: challenge, the Vercel Firewall served its challenge ou x-vercel-mitigated: deny, the Vercel Firewall blocked the request ou Vercel Security Checkpoint script under /.well-known/vercel/security/static/) e (Hosted on Vercel; hosting, not bot protection on its own ou Vercel request id header; present on any Vercel response) |
| BotID script with its path in the page's scripts | 100% | BotID client script on its fixed path (a-4-a/c.js or p.js) e BotID path written in the page's scripts |
| Checkpoint script with its answer request or token | 95% | Vercel Security Checkpoint script under /.well-known/vercel/security/static/ e (Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge ou x-vercel-challenge-token header of the Vercel Security Checkpoint) |
| Checkpoint token or answer request on a Vercel response | 85% | (x-vercel-challenge-token header of the Vercel Security Checkpoint ou Vercel Security Checkpoint answer endpoint /.well-known/vercel/security/request-challenge) e (Hosted on Vercel; hosting, not bot protection on its own ou Vercel request id header; present on any Vercel response) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Vercel Firewall estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Vercel Firewall sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Vercel Firewall com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
