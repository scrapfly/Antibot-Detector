[English](../azure-waf.md) | [Español](../es/azure-waf.md) | [Русский](../ru/azure-waf.md) | [简体中文](../zh-CN/azure-waf.md) | [日本語](../ja/azure-waf.md) | **Português (Brasil)** | [Deutsch](../de/azure-waf.md) | [Français](../fr/azure-waf.md) | [한국어](../ko/azure-waf.md)

# Proteção antibot Azure WAF: como detectar (e o que ela significa para o web scraping)

Azure WAF é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Azure WAF, quer detectar o Azure WAF em um site ou está investigando um web scraping bloqueado pelo Azure WAF, o primeiro passo é o mesmo: confirmar que é mesmo o Azure WAF que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Azure WAF, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Azure Web Application Firewall é o WAF da Microsoft para o Azure Front Door e o Application Gateway. Além de bloquear ataques, as regras de bots podem responder a clientes suspeitos com um desafio JavaScript ou, no Front Door, com um CAPTCHA.

Site oficial: [https://learn.microsoft.com/azure/web-application-firewall/](https://learn.microsoft.com/azure/web-application-firewall/)

## Como saber se um site usa Azure WAF

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-azure-waf` (versão da regra 2.0.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^afd_azwaf_jsclearance$` | 90% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^appgw_azwaf_jsclearance$` | 90% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^afd_azwaf_captcha$` | 90% | afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Front Door JavaScript challenge and CAPTCHA cookies | 100% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) e afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |
| JavaScript challenge cookies of Front Door and Application Gateway | 95% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) e appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| Application Gateway JavaScript challenge cookie with the Front Door CAPTCHA cookie | 95% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) e afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Azure WAF estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Azure WAF sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Azure WAF com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
