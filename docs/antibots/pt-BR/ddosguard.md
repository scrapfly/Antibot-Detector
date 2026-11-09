[English](../ddosguard.md) | [Español](../es/ddosguard.md) | [Русский](../ru/ddosguard.md) | [简体中文](../zh-CN/ddosguard.md) | [日本語](../ja/ddosguard.md) | **Português (Brasil)** | [Deutsch](../de/ddosguard.md) | [Français](../fr/ddosguard.md) | [한국어](../ko/ddosguard.md)

# Proteção antibot DDoS-Guard: como detectar (e o que ela significa para o web scraping)

DDoS-Guard é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o DDoS-Guard, quer detectar o DDoS-Guard em um site ou está investigando um web scraping bloqueado pelo DDoS-Guard, o primeiro passo é o mesmo: confirmar que é mesmo o DDoS-Guard que responde às suas requisições. Esta página lista os 4 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do DDoS-Guard, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A DDoS-Guard é uma provedora de hospedagem e proteção contra DDoS que funciona como proxy reverso. Ela pode exibir uma verificação do navegador para os visitantes que deseja validar.

Site oficial: [https://ddos-guard.net/](https://ddos-guard.net/)

## Como saber se um site usa DDoS-Guard

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-ddosguard` (versão da regra 2.0.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^__ddg(?:[0-9]{1,2}\|id\|mark)_$` | 100% | DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^server$: ^ddos-guard$` | 100% | DDoS-Guard server header |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/\.well-known/ddos-guard/(?:check\|js-challenge/\|id/)` | 100% | DDoS-Guard check scripts under /.well-known/ddos-guard/ |
| `^https?://check\.ddos-guard\.net/` | 100% | Request to check.ddos-guard.net |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| DDoS-Guard server with its cookies | 100% | DDoS-Guard server header e DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies) |
| Browser check script on a DDoS-Guard response | 100% | (DDoS-Guard check scripts under /.well-known/ddos-guard/ ou Request to check.ddos-guard.net) e (DDoS-Guard server header ou DDoS-Guard cookies (__ddg1_, __ddgid_, __ddgmark_ and the other numbered __ddg cookies)) |
| Check scripts on the site and on check.ddos-guard.net | 95% | DDoS-Guard check scripts under /.well-known/ddos-guard/ e Request to check.ddos-guard.net |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o DDoS-Guard estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo DDoS-Guard sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o DDoS-Guard com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
