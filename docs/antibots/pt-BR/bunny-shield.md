[English](../bunny-shield.md) | [Español](../es/bunny-shield.md) | [Русский](../ru/bunny-shield.md) | [简体中文](../zh-CN/bunny-shield.md) | [日本語](../ja/bunny-shield.md) | **Português (Brasil)** | [Deutsch](../de/bunny-shield.md) | [Français](../fr/bunny-shield.md) | [한국어](../ko/bunny-shield.md)

# Proteção antibot Bunny Shield: como detectar (e o que ela significa para o web scraping)

Bunny Shield é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Bunny Shield, quer detectar o Bunny Shield em um site ou está investigando um web scraping bloqueado pelo Bunny Shield, o primeiro passo é o mesmo: confirmar que é mesmo o Bunny Shield que responde às suas requisições. Esta página lista os 5 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Bunny Shield, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Bunny Shield é o produto de segurança na borda da bunny.net, uma empresa de CDN. Ele adiciona firewall de aplicações web, limitação de requisições e detecção de bots aos sites na bunny.net, e pode pedir ao navegador que resolva um desafio JavaScript de prova de trabalho.

Site oficial: [https://bunny.net/shield/](https://bunny.net/shield/)

## Como saber se um site usa Bunny Shield

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-bunny-shield` (versão da regra 2.0.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^bunny_shield$` | 90% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) |
| `^bunny_shield_chk$` | 90% | bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| `^bunny_shield_id$` | 90% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) |
| `^bunny_shield_bd$` | 90% | bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^server$: ^BunnyCDN-[A-Z0-9]{2,6}-[0-9]{1,8}$` | 40% (apenas corroboração) | Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Proof-of-work cookie with its checksum | 100% | bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) e bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) |
| Bot detection identifier and fingerprint cookies | 95% | bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) e bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs) |
| Bunny Shield cookie on a bunny.net edge response | 95% | (bunny_shield cookie that marks a passed Bunny Shield proof-of-work challenge (bunny.net docs) ou bunny_shield_chk checksum cookie that protects the bunny_shield cookie (bunny.net docs) ou bunny_shield_id identifier cookie of Bunny Shield bot detection (bunny.net docs) ou bunny_shield_bd cookie holding the browser fingerprint Bunny Shield bot detection takes (bunny.net docs)) e Server header BunnyCDN-<PoP>-<server id> of a bunny.net edge; proves the CDN, not protection |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Bunny Shield estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Bunny Shield sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Bunny Shield com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
