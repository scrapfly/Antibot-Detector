[English](../incapsula.md) | [Español](../es/incapsula.md) | [Русский](../ru/incapsula.md) | [简体中文](../zh-CN/incapsula.md) | [日本語](../ja/incapsula.md) | **Português (Brasil)** | [Deutsch](../de/incapsula.md) | [Français](../fr/incapsula.md) | [한국어](../ko/incapsula.md)

# Proteção antibot Incapsula (Imperva): como detectar (e o que ela significa para o web scraping)

Incapsula (Imperva) é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Incapsula (Imperva), quer detectar o Incapsula (Imperva) em um site ou está investigando um web scraping bloqueado pelo Incapsula (Imperva), o primeiro passo é o mesmo: confirmar que é mesmo o Incapsula (Imperva) que responde às suas requisições. Esta página lista os 10 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Incapsula (Imperva), o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

Incapsula é o antigo nome do firewall de aplicações web e CDN em nuvem da Imperva. Ele combina regras de WAF com proteção contra bots e costuma ser reconhecido pelos seus cookies.

Site oficial: [https://www.imperva.com/products/web-application-firewall-waf/](https://www.imperva.com/products/web-application-firewall-waf/)

## Como saber se um site usa Incapsula (Imperva)

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-incapsula` (versão da regra 2.1.0, última atualização 2026-10-16). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^incap_ses_[0-9]+_[0-9]+$` | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) |
| `^visid_incap_[0-9]+$` | 100% | Incapsula visitor ID cookie (visid_incap_<site>) |
| `^nlbi_[0-9]+(?:_[0-9]+)?$` | 60% | Incapsula load balancer cookie (nlbi_<site>) |
| `^reese84$` | 100% | Imperva Advanced Bot Protection token cookie |
| `^___utmvc$` | 100% | Incapsula JavaScript challenge cookie (___utmvc) |
| `^_impv_routing$` | 40% (apenas corroboração) | Imperva edge routing cookie (seen with incap_ses_ / visid_incap_) |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-iinfo$` | 100% | Incapsula request info response header |
| `^x-cdn$: ^(?:Imperva\|Incapsula)$` | 100% | Imperva CDN response header |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/_Incapsula_Resource\?` | 100% | Incapsula challenge resource endpoint |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `_Incapsula_Resource` | 20% | Script reference to _Incapsula_Resource or the incident page |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Incapsula session and visitor cookies | 100% | Incapsula session cookie (incap_ses_<proxy>_<site>) e (Incapsula visitor ID cookie (visid_incap_<site>) ou Incapsula load balancer cookie (nlbi_<site>) ou Imperva edge routing cookie (seen with incap_ses_ / visid_incap_)) |
| Imperva edge header with an Incapsula cookie | 100% | (Incapsula request info response header ou Imperva CDN response header) e (Incapsula session cookie (incap_ses_<proxy>_<site>) ou Incapsula visitor ID cookie (visid_incap_<site>) ou Incapsula load balancer cookie (nlbi_<site>) ou Imperva Advanced Bot Protection token cookie) |
| Incapsula challenge resource with a challenge cookie | 90% | Incapsula challenge resource endpoint e (Incapsula JavaScript challenge cookie (___utmvc) ou Imperva Advanced Bot Protection token cookie ou Incapsula session cookie (incap_ses_<proxy>_<site>)) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Incapsula (Imperva) estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Incapsula (Imperva) sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Incapsula (Imperva) com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
