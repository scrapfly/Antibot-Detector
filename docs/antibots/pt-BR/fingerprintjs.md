[English](../fingerprintjs.md) | [Español](../es/fingerprintjs.md) | [Русский](../ru/fingerprintjs.md) | [简体中文](../zh-CN/fingerprintjs.md) | [日本語](../ja/fingerprintjs.md) | **Português (Brasil)** | [Deutsch](../de/fingerprintjs.md) | [Français](../fr/fingerprintjs.md) | [한국어](../ko/fingerprintjs.md)

# Proteção antibot FingerprintJS: como detectar (e o que ela significa para o web scraping)

FingerprintJS é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o FingerprintJS, quer detectar o FingerprintJS em um site ou está investigando um web scraping bloqueado pelo FingerprintJS, o primeiro passo é o mesmo: confirmar que é mesmo o FingerprintJS que responde às suas requisições. Esta página lista os 13 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do FingerprintJS, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O FingerprintJS é uma biblioteca de fingerprinting de navegador, disponível em uma versão de código aberto e em um serviço comercial Pro da Fingerprint. A biblioteca BotD é uma ferramenta de código aberto de detecção de bots, separada. Encontrá-lo indica que o site coleta sinais do dispositivo, não necessariamente que bloqueia bots.

Site oficial: [https://fingerprint.com/](https://fingerprint.com/)

## Como saber se um site usa FingerprintJS

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-fingerprintjs` (versão da regra 2.3.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://(?:[a-z0-9-]+\.){0,2}fpcdn\.io/v[34](?:[/?#]\|$)` | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host |
| `^https://openfpcdn\.io/fingerprintjs/v[0-9]+(?:[/?#]\|$)` | 100% | FingerprintJS open-source library on the vendor openfpcdn.io host |
| `^https://fpnpmcdn\.net/v[34]/[A-Za-z0-9]+/loader_v\d+\.\d+\.\d+\.js(?:[?#]\|$)` | 100% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net |
| `^https://(?:[a-z0-9-]+\.)?api\.fpjs\.(?:io\|sh\|pro)(?:[/?#]\|$)` | 100% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| `^https?://[^/?#]+/[^?#]*\?(?:[^#]*&)?ci=jsl?/[34]\.\d+\.\d+(?:[&#]\|$)` | 30% (apenas corroboração) | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter |
| `^https?://[^/?#]+/(?:[^?#]*/)?fp\.(?:esm\|umd\|cjs)(?:\.[A-Za-z0-9_-]{6,})?\.js(?:[?#]\|$)` | 50% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own |
| `^https://m1\.openfpcdn\.io/fingerprintjs/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | OSS npm package monitoring ping on the vendor m1.openfpcdn.io host |
| `^https?://[^/?#]+/fpjs/api(?:[/?#]\|$)` | 25% (apenas corroboração) | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS |
| `^https://openfpcdn\.io/botd/v[0-9]+(?:[/?#]\|$)` | 100% | BotD bot detection library on the vendor openfpcdn.io host (botd/v1, botd/v2) |
| `^https://m1\.openfpcdn\.io/botd/v\d+(?:\.\d+){0,2}/npm-monitoring$` | 100% | BotD npm package monitoring ping on the vendor m1.openfpcdn.io host |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `FingerprintJS` | 10% | Script reference to the FingerprintJS agent global |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `FingerprintJS (typeof object)` | 45% | FingerprintJS agent global object |
| `__fpjs_pvid (typeof string)` | 40% | Page-visit id the FingerprintJS Pro agent stores on window |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Pro agent loader with the agent global | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host e FingerprintJS agent global object |
| Open-source library with the agent global | 75% | FingerprintJS open-source library on the vendor openfpcdn.io host e FingerprintJS agent global object |
| First-party proxy endpoint with agent evidence | 85% | First-party Pro proxy endpoint forwarding agent traffic to FingerprintJS e (FingerprintJS agent global object ou Script reference to the FingerprintJS agent global ou Page-visit id the FingerprintJS Pro agent stores on window) |
| Bundled npm library with agent evidence | 75% | Open-source library bundled from the npm package: bundlers keep its fp.esm / fp.umd file name (e.g. fp.esm.<hash>.js), so the host is the site's own e (FingerprintJS agent global object ou Script reference to the FingerprintJS agent global ou OSS npm package monitoring ping on the vendor m1.openfpcdn.io host) |
| Pro agent calling the vendor API with agent evidence | 85% | FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) e (FingerprintJS agent global object ou Script reference to the FingerprintJS agent global ou Page-visit id the FingerprintJS Pro agent stores on window) |
| npm Pro loader with calls to the vendor API | 85% | FingerprintJS Pro agent loader fetched by the npm package from fpnpmcdn.net e FingerprintJS Pro identification API on the vendor api.fpjs.io host (global or regional) |
| CDN Pro loader with the agent's page-visit id | 80% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host e Page-visit id the FingerprintJS Pro agent stores on window |
| First-party proxied Pro agent with its page-visit id | 80% | Pro agent request through a first-party proxy, recognisable by its ci=js/<version> client parameter e Page-visit id the FingerprintJS Pro agent stores on window |
| Pro agent loader, agent global and script reference | 100% | FingerprintJS Pro agent loader (v3/v4) on the vendor fpcdn.io host e FingerprintJS agent global object e Script reference to the FingerprintJS agent global |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o FingerprintJS estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo FingerprintJS sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o FingerprintJS com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
