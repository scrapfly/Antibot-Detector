[English](../akamai.md) | [Español](../es/akamai.md) | [Русский](../ru/akamai.md) | [简体中文](../zh-CN/akamai.md) | [日本語](../ja/akamai.md) | **Português (Brasil)** | [Deutsch](../de/akamai.md) | [Français](../fr/akamai.md) | [한국어](../ko/akamai.md)

# Proteção antibot Akamai Bot Manager: como detectar (e o que ela significa para o web scraping)

Akamai Bot Manager é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Akamai Bot Manager, quer detectar o Akamai Bot Manager em um site ou está investigando um web scraping bloqueado pelo Akamai Bot Manager, o primeiro passo é o mesmo: confirmar que é mesmo o Akamai Bot Manager que responde às suas requisições. Esta página lista os 20 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Akamai Bot Manager, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Akamai Bot Manager é o produto de gerenciamento de bots da Akamai Technologies, empresa de CDN e segurança. Ele é vendido a grandes sites como parte da plataforma de borda da Akamai e busca distinguir pessoas, bots legítimos e automação abusiva.

Site oficial: [https://www.akamai.com/products/bot-manager](https://www.akamai.com/products/bot-manager)

## Como saber se um site usa Akamai Bot Manager

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-akamai` (versão da regra 2.3.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `_abck = ^[0-9A-F]{32}~-?[0-9]+~` | 100% | Bot Manager sensor cookie in its documented hash~state~token shape |
| `bm_sz = ^[0-9A-F]{32}~` | 100% | Bot Manager session cookie (hash~token) |
| `^ak_bmsc$ = ^[0-9A-F]{32}~0{3,}~` | 100% | Bot Manager edge session cookie |
| `^bm_(?:mi\|s\|so\|lso)$` | 30% (apenas corroboração) | Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only |
| `^bm_sv$` | 60% | Bot Manager cookie bm_sv, named in Akamai's cookie documentation |
| `^sbsd(?:_o)?$` | 65% | SBSD challenge cookie |
| `^(?:AKA_A2\|akavpau_[A-Za-z0-9_]+)$` | 15% (apenas corroboração) | Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own |
| `^sec_cpt$ = ~[0-9]~` | 70% | sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^server$: ^AkamaiGHost$` | 15% (apenas corroboração) | Akamai edge server header; CDN delivery, not Bot Manager on its own |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | First-party Bot Manager sensor script under /akam/<version>/ |
| `^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$)` | 100% | Bot Manager pixel challenge endpoint |
| `^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$)` | 100% | SBSD challenge endpoint |
| `^https?://[^/?#]+/_sec/cp_challenge/[A-Za-z0-9_.-]{1,64}(?:[?#]\|$)` | 70% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ |
| `^https?://[^/?#]+/(?:[A-Za-z0-9_-]{2,40}/){3,}[A-Za-z0-9_-]{2,40}$` | 20% (apenas corroboração) | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `bmak` | 15% | Script reference to the bmak sensor namespace |
| `bazadebezolkohpepadr` | 100% | Pixel challenge bootstrap variable injected into the page; only Akamai uses it |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `bmak (typeof object)` | 60% | Bot Manager sensor object (bmak) |

### Payloads de requisição e resposta

Dados que a página envia para um endereço correspondente, ou recebe dele.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `body "sensor_data":"[0-9]{1,2};[0-9];[0-9];[0-9];[0-9]{6,9};` | 100% | Bot Manager sensor_data POST body |
| `URL ^https?://[^/?#]+/(?:\.well-known\|_sec)/sbsd(?:[/?#]\|$) ; body body` | 70% | SBSD challenge POST to the sbsd endpoint |
| `URL ^https?://[^/?#]+/akam/[0-9]{1,3}/pixel_[0-9a-f]{6,10}(?:[?#]\|$) ; body jsv=` | 65% | Pixel challenge fingerprint POST |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Sensor cookie with session cookie | 90% | Bot Manager sensor cookie in its documented hash~state~token shape e (Bot Manager session cookie (hash~token) ou Bot Manager edge session cookie ou Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only ou Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Sensor script or object with a Bot Manager cookie | 100% | (First-party Bot Manager sensor script under /akam/<version>/ ou Bot Manager sensor object (bmak) ou Bot Manager sensor_data POST body) e (Bot Manager sensor cookie in its documented hash~state~token shape ou Bot Manager session cookie (hash~token) ou Bot Manager edge session cookie) |
| Random-path first-party script on an Akamai edge with Bot Manager cookies | 85% | First-party script on a long random multi-segment path, the shape of the Bot Manager sensor script e Bot Manager sensor cookie in its documented hash~state~token shape e (Akamai edge server header; CDN delivery, not Bot Manager on its own ou Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own ou Bot Manager session cookie (hash~token)) |
| SBSD challenge endpoint with its cookie | 90% | (SBSD challenge endpoint ou SBSD challenge POST to the sbsd endpoint) e SBSD challenge cookie |
| Akamai edge with a Bot Manager sensor or session cookie | 80% | (Akamai edge server header; CDN delivery, not Bot Manager on its own ou Akamai edge platform cookie (CDN or waiting room); not Bot Manager on its own) e (Bot Manager sensor cookie in its documented hash~state~token shape ou Bot Manager session cookie (hash~token) ou Bot Manager edge session cookie ou Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Bot Manager edge session with its companion cookie | 85% | Bot Manager edge session cookie e (Other Bot Manager cookies (bm_mi, bm_s, bm_so); short names, corroboration only ou Bot Manager cookie bm_sv, named in Akamai's cookie documentation) |
| Crypto challenge path with its sec_cpt or Bot Manager cookie | 95% | Bot Manager crypto challenge resource or verification under /_sec/cp_challenge/ e (sec_cpt cookie of the Bot Manager crypto challenge (state ~1~ open, ~3~ solved) ou Bot Manager sensor cookie in its documented hash~state~token shape ou Bot Manager session cookie (hash~token)) |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Akamai Bot Manager estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Akamai Bot Manager sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Akamai Bot Manager com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
