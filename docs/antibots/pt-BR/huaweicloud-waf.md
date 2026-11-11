[English](../huaweicloud-waf.md) | [Español](../es/huaweicloud-waf.md) | [Русский](../ru/huaweicloud-waf.md) | [简体中文](../zh-CN/huaweicloud-waf.md) | [日本語](../ja/huaweicloud-waf.md) | **Português (Brasil)** | [Deutsch](../de/huaweicloud-waf.md) | [Français](../fr/huaweicloud-waf.md) | [한국어](../ko/huaweicloud-waf.md)

# Proteção antibot Huawei Cloud WAF: como detectar (e o que ela significa para o web scraping)

Huawei Cloud WAF é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Huawei Cloud WAF, quer detectar o Huawei Cloud WAF em um site ou está investigando um web scraping bloqueado pelo Huawei Cloud WAF, o primeiro passo é o mesmo: confirmar que é mesmo o Huawei Cloud WAF que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Huawei Cloud WAF, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Huawei Cloud WAF é o firewall de aplicações web da Huawei Cloud. Em um site conectado, ele adiciona cookies de sessão às requisições dos visitantes, que as regras de proteção contra ataques CC e anti-crawler usam para contar e acompanhar as requisições.

Site oficial: [https://www.huaweicloud.com/intl/en-us/product/waf.html](https://www.huaweicloud.com/intl/en-us/product/waf.html)

## Como saber se um site usa Huawei Cloud WAF

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-huaweicloud-waf` (versão da regra 2.0.0, última atualização 2026-11-11). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^HWWAFSESID$` | 90% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| `^HWWAFSESTIME$` | 90% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^server$: HuaweiCloudWAF` | 40% (apenas corroboração) | Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Both WAF session cookies | 100% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) e HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) |
| Session ID cookie with the WAF server header | 95% | HWWAFSESID session ID cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) e Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |
| Session timestamp cookie with the WAF server header | 95% | HWWAFSESTIME session timestamp cookie that Huawei Cloud WAF inserts to mark requests (Huawei Cloud help) e Server header HuaweiCloudWAF, listed by the open-source WAFW00F tool; supporting signal only |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Huawei Cloud WAF estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Huawei Cloud WAF sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Huawei Cloud WAF com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
