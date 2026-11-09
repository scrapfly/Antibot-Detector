[English](../yundun.md) | [Español](../es/yundun.md) | [Русский](../ru/yundun.md) | [简体中文](../zh-CN/yundun.md) | [日本語](../ja/yundun.md) | **Português (Brasil)** | [Deutsch](../de/yundun.md) | [Français](../fr/yundun.md) | [한국어](../ko/yundun.md)

# Proteção antibot Yundun Cloud WAF: como detectar (e o que ela significa para o web scraping)

Yundun Cloud WAF é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Yundun Cloud WAF, quer detectar o Yundun Cloud WAF em um site ou está investigando um web scraping bloqueado pelo Yundun Cloud WAF, o primeiro passo é o mesmo: confirmar que é mesmo o Yundun Cloud WAF que responde às suas requisições. Esta página lista os 11 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Yundun Cloud WAF, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Yundun é uma provedora chinesa de segurança em nuvem que oferece um WAF em nuvem e um serviço anti-DDoS. Suas verificações são comuns em sites chineses.

Site oficial: [https://www.yundun.com/](https://www.yundun.com/)

## Como saber se um site usa Yundun Cloud WAF

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-yundun` (versão da regra 2.0.2, última atualização 2026-10-29). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^yd_cookie$` | 50% | Yundun session cookie |
| `^bc_bot_(?:session\|token\|rules\|score\|fp)$` | 60% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) |
| `^waf_captcha_marker$` | 60% | Yundun WAF captcha marker cookie |
| `^https_waf_cookie$` | 40% (apenas corroboração) | Yundun WAF session cookie |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^server$: ^YUNDUN` | 70% | Server header carrying the Yundun edge signature (legacy edges) |
| `^x-cache$: ^YUNDUN` | 55% | Cache header carrying the Yundun edge signature (legacy edges) |
| `^server$: ^WAF$` | 35% (apenas corroboração) | Server: WAF sent by the current Yundun edge |
| `^x-cache$: ^BYPASS$` | 25% (apenas corroboração) | X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://www\.yundun\.com/(?:static/js/\|yd[-_]http[-_]error)` | 50% | Challenge or fingerprint helper resource on the vendor www.yundun.com host |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/static/js/waf_captcha_embedded_bs_v[0-9.]+\.js(?:[?#]\|$)` | 75% | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |
| `^https?://[^/?#]+/cdn_cgi_bs_captcha/` | 60% (apenas corroboração) | First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Server and cache headers both carrying the edge signature | 85% | Server header carrying the Yundun edge signature (legacy edges) e Cache header carrying the Yundun edge signature (legacy edges) |
| Session cookie with a Yundun response header | 80% | Yundun session cookie e (Server header carrying the Yundun edge signature (legacy edges) ou Cache header carrying the Yundun edge signature (legacy edges)) |
| Both response headers plus the session cookie | 95% | Server header carrying the Yundun edge signature (legacy edges) e Cache header carrying the Yundun edge signature (legacy edges) e Yundun session cookie |
| Server: WAF and X-Cache: BYPASS with the WAF session cookie | 80% | Server: WAF sent by the current Yundun edge e X-Cache: BYPASS on dynamic responses through the Yundun edge (shared with other CDNs) e Yundun WAF session cookie |
| First-party captcha script with a Yundun cookie | 90% | (First-party Yundun WAF captcha script (cdn_cgi_bs_captcha) ou First-party Yundun WAF captcha script (cdn_cgi_bs_captcha)) e (Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) ou Yundun WAF captcha marker cookie ou Yundun WAF session cookie) |
| Bot-check and captcha-marker cookies behind the WAF edge | 95% | Yundun bot-check cookie family (bc_bot_session, _token, _rules, _score, _fp) e Yundun WAF captcha marker cookie e Server: WAF sent by the current Yundun edge |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Yundun Cloud WAF estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Yundun Cloud WAF sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Yundun Cloud WAF com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
