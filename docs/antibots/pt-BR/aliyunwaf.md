[English](../aliyunwaf.md) | [Español](../es/aliyunwaf.md) | [Русский](../ru/aliyunwaf.md) | [简体中文](../zh-CN/aliyunwaf.md) | [日本語](../ja/aliyunwaf.md) | **Português (Brasil)** | [Deutsch](../de/aliyunwaf.md) | [Français](../fr/aliyunwaf.md) | [한국어](../ko/aliyunwaf.md)

# Proteção antibot Alibaba Cloud WAF: como detectar (e o que ela significa para o web scraping)

Alibaba Cloud WAF é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Alibaba Cloud WAF, quer detectar o Alibaba Cloud WAF em um site ou está investigando um web scraping bloqueado pelo Alibaba Cloud WAF, o primeiro passo é o mesmo: confirmar que é mesmo o Alibaba Cloud WAF que responde às suas requisições. Esta página lista os 8 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Alibaba Cloud WAF, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Alibaba Cloud WAF é o firewall de aplicações web da Alibaba Cloud. Além de filtrar ataques, ele pode exibir desafios de JavaScript a clientes em que não confia, e por isso aparece na frente de muitos sites chineses e de alguns sites globais.

Site oficial: [https://www.alibabacloud.com/product/waf](https://www.alibabacloud.com/product/waf)

## Como saber se um site usa Alibaba Cloud WAF

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-aliyunwaf` (versão da regra 2.1.0, última atualização 2026-10-16). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^acw_sc__v2$` | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie |
| `^acw_tc$` | 40% (apenas corroboração) | Alibaba Cloud WAF load-balancing session cookie |
| `^cdn_sec_tc$` | 35% (apenas corroboração) | Alibaba CDN security session cookie |
| `^ssxmod_itna2?$` | 45% (apenas corroboração) | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://errors\.aliyundun\.(?:com\|net)/` | 55% | Block-page help resources on the Aliyun Yundun errors host |
| `^https://errors\.aliyun\.com/images/TB15QGaHpXXXXXOaXXXXia39XXX-660-117\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) |
| `^https://g\.alicdn\.com/sd-base/static/[^/?#]+/image/405\.png(?:[?#]\|$)` | 70% | Banner image of the Alibaba Cloud WAF 405 block page (English UI) |

### Elementos do DOM

Elementos encontrados por seletor CSS.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `#block_traceid_tips` | 45% (apenas corroboração) | Trace-id line of the Alibaba Cloud WAF block page |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Paired WAF edge session cookies | 70% | Alibaba Cloud WAF load-balancing session cookie e Alibaba CDN security session cookie |
| Alibaba bot-protection cookie with the edge cookie | 80% | Alibaba Cloud bot-protection cookie written by its JavaScript next to acw_tc (seen with the acw_sc__v2 challenge) e Alibaba Cloud WAF load-balancing session cookie |
| Challenge clearance cookie with an edge session cookie | 90% | Alibaba Cloud WAF JavaScript-challenge clearance cookie e (Alibaba Cloud WAF load-balancing session cookie ou Alibaba CDN security session cookie) |
| Error-host resource with a WAF session cookie | 85% | Block-page help resources on the Aliyun Yundun errors host e (Alibaba Cloud WAF JavaScript-challenge clearance cookie ou Alibaba Cloud WAF load-balancing session cookie) |
| WAF 405 block page banner with its trace-id line | 90% | (Banner image of the Alibaba Cloud WAF 405 block page (Chinese UI) ou Banner image of the Alibaba Cloud WAF 405 block page (English UI)) e Trace-id line of the Alibaba Cloud WAF block page |
| Clearance cookie, session cookie and error-host resource | 100% | Alibaba Cloud WAF JavaScript-challenge clearance cookie e Alibaba Cloud WAF load-balancing session cookie e Block-page help resources on the Aliyun Yundun errors host |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Alibaba Cloud WAF estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Alibaba Cloud WAF sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Alibaba Cloud WAF com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
