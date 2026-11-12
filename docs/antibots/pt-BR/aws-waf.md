[English](../aws-waf.md) | [Español](../es/aws-waf.md) | [Русский](../ru/aws-waf.md) | [简体中文](../zh-CN/aws-waf.md) | [日本語](../ja/aws-waf.md) | **Português (Brasil)** | [Deutsch](../de/aws-waf.md) | [Français](../fr/aws-waf.md) | [한국어](../ko/aws-waf.md)

# Proteção antibot AWS WAF: como detectar (e o que ela significa para o web scraping)

AWS WAF é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o AWS WAF, quer detectar o AWS WAF em um site ou está investigando um web scraping bloqueado pelo AWS WAF, o primeiro passo é o mesmo: confirmar que é mesmo o AWS WAF que responde às suas requisições. Esta página lista os 14 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do AWS WAF, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O AWS WAF é o firewall de aplicações web da Amazon Web Services. Seus recursos Bot Control e de desafio podem exigir que o navegador execute um desafio de JavaScript e guarde um token, de modo que um cliente HTTP simples pode ser recusado.

Site oficial: [https://aws.amazon.com/waf/](https://aws.amazon.com/waf/)

## Como saber se um site usa AWS WAF

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-aws-waf` (versão da regra 2.3.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^aws-waf-token$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9+/=_:-]{20,}` | 100% | AWS WAF token cookie set after a challenge |
| `^aws-waf-token$` | 85% | AWS WAF token cookie by name; its value format is not documented |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-amzn-waf-action$: ^(?:challenge\|captcha)$` | 100% | AWS WAF challenge or captcha action header |
| `^x-amzn-waf-challenge-id$` | 40% (apenas corroboração) | AWS WAF challenge id header |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:challenge\|captcha\|jsapi)\.js(?:[?#]\|$)` | 100% | Integration SDK from the regional token.awswaf.com host |
| `^https://(?:[a-z0-9-]+\.)+(?:token\|sdk)\.awswaf\.com/(?:[0-9a-f]{8,16}/){2,3}(?:inputs\|verify\|telemetry\|voucher\|mp_verify)(?:[?#/]\|$)` | 100% | Any request to the regional token.awswaf.com host (inputs, verify, telemetry) |
| `^https://[0-9a-f]{8,16}\.[0-9a-f]{6,12}\.[a-z]{2}-[a-z]+-[0-9]\.captcha\.awswaf\.com/` | 100% | AWS WAF CAPTCHA host |
| `^https://(?:[a-z0-9-]+\.)+awswaf\.com(?:[/?#:]\|$)` | 100% | Any request to an AWS WAF host (*.awswaf.com) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `gokuProps` | 15% (apenas corroboração) | Challenge page bootstrap variable (window.gokuProps) |
| `AwsWafIntegration` | 10% | Integration SDK namespace reference |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `AwsWafIntegration (typeof object)` | 75% | AWS WAF Integration SDK object |
| `gokuProps (typeof object)` | 70% | Challenge page bootstrap object (gokuProps) |
| `AwsWafCaptcha (typeof object)` | 75% | AWS WAF Integration SDK object |
| `awsWafCookieDomainList (exists)` | 30% (apenas corroboração) | Token cookie domain list for the Integration SDK |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Challenge response with its bootstrap | 100% | (AWS WAF challenge or captcha action header ou AWS WAF challenge id header) e (Challenge page bootstrap object (gokuProps) ou Challenge page bootstrap variable (window.gokuProps) ou Integration SDK from the regional token.awswaf.com host) |
| Integration SDK with token traffic or cookie | 100% | (Integration SDK from the regional token.awswaf.com host ou AWS WAF Integration SDK object) e (AWS WAF token cookie set after a challenge ou Any request to the regional token.awswaf.com host (inputs, verify, telemetry) ou Token cookie domain list for the Integration SDK) |
| Token cookie with SDK reference | 90% | (AWS WAF token cookie set after a challenge ou AWS WAF token cookie by name; its value format is not documented) e (Integration SDK namespace reference ou Challenge page bootstrap variable (window.gokuProps) ou Token cookie domain list for the Integration SDK) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o AWS WAF estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo AWS WAF sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o AWS WAF com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
