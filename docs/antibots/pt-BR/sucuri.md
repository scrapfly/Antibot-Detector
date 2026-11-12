[English](../sucuri.md) | [Español](../es/sucuri.md) | [Русский](../ru/sucuri.md) | [简体中文](../zh-CN/sucuri.md) | [日本語](../ja/sucuri.md) | **Português (Brasil)** | [Deutsch](../de/sucuri.md) | [Français](../fr/sucuri.md) | [한국어](../ko/sucuri.md)

# Proteção antibot Sucuri WAF: como detectar (e o que ela significa para o web scraping)

Sucuri WAF é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Sucuri WAF, quer detectar o Sucuri WAF em um site ou está investigando um web scraping bloqueado pelo Sucuri WAF, o primeiro passo é o mesmo: confirmar que é mesmo o Sucuri WAF que responde às suas requisições. Esta página lista os 8 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Sucuri WAF, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Sucuri é uma empresa de segurança de sites cujo WAF e CDN em nuvem ficam na frente de um site para filtrar ataques e tráfego indesejado.

Site oficial: [https://sucuri.net/](https://sucuri.net/)

## Como saber se um site usa Sucuri WAF

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-sucuri` (versão da regra 2.2.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^sucuri_cloudproxy_uuid_[0-9a-f]{6,12}$` | 100% | Sucuri CloudProxy JS-challenge cookie |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-sucuri-id$` | 100% | Sucuri WAF node id header |
| `^x-sucuri-block$` | 100% | Sucuri block reason header |
| `^server$: ^Sucuri/Cloudproxy$` | 100% | Sucuri CloudProxy server header |
| `^x-sucuri-cache$` | 50% (apenas corroboração) | Sucuri cache status header |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `Sucuri Web ?Site Firewall - (?:CloudProxy - )?Access Denied\|Access Denied - Sucuri Web ?Site Firewall` | 30% (apenas corroboração) | Sucuri block page title |
| `Block ID:` | 20% (apenas corroboração) | Block ID label on the Sucuri block page |
| `sucuri_cloudproxy_js` | 10% | Sucuri CloudProxy JS challenge variable |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Sucuri block page with its headers | 100% | (Sucuri block page title ou Block ID label on the Sucuri block page) e (Sucuri WAF node id header ou Sucuri block reason header ou Sucuri CloudProxy server header) |
| Sucuri server with node id | 100% | Sucuri CloudProxy server header e (Sucuri WAF node id header ou Sucuri cache status header) |
| CloudProxy challenge with its cookie or headers | 90% | Sucuri CloudProxy JS challenge variable e (Sucuri CloudProxy JS-challenge cookie ou Sucuri WAF node id header ou Sucuri CloudProxy server header) |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Sucuri WAF estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Sucuri WAF sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Sucuri WAF com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
