[English](../radware.md) | [Español](../es/radware.md) | [Русский](../ru/radware.md) | [简体中文](../zh-CN/radware.md) | [日本語](../ja/radware.md) | **Português (Brasil)** | [Deutsch](../de/radware.md) | [Français](../fr/radware.md) | [한국어](../ko/radware.md)

# Proteção antibot Radware Bot Manager: como detectar (e o que ela significa para o web scraping)

Radware Bot Manager é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Radware Bot Manager, quer detectar o Radware Bot Manager em um site ou está investigando um web scraping bloqueado pelo Radware Bot Manager, o primeiro passo é o mesmo: confirmar que é mesmo o Radware Bot Manager que responde às suas requisições. Esta página lista os 10 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Radware Bot Manager, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Radware Bot Manager, antes chamado ShieldSquare, é o produto de gerenciamento de bots da Radware. A Radware também vende um WAF em nuvem, e o detector procura vestígios de ambos.

Site oficial: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## Como saber se um site usa Radware Bot Manager

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-radware` (versão da regra 2.2.0, última atualização 2026-10-16). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (apenas corroboração) | Radware Bot Manager cookies written by its JavaScript |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `CloudWebSec.radware.com` | 20% (apenas corroboração) | Script reference to the CloudWebSec vendor portal host |
| `Unauthorized Request Blocked` | 20% (apenas corroboração) | Script reference to the Radware block-page message |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | Script reference to the CloudWebSec vendor portal host e Script reference to the Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header e (Script reference to the CloudWebSec vendor portal host ou Script reference to the Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header e Script reference to the CloudWebSec vendor portal host e Script reference to the Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) e First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) e First-party Radware Bot Manager script (stormcaster.js) e Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host e Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge e (Radware Bot Manager session cookies (__uzma … __uzmf) ou Radware Bot Manager cookies written by its JavaScript) |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Radware Bot Manager estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Radware Bot Manager sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Radware Bot Manager com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
