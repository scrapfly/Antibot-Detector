[English](../datadome.md) | [Español](../es/datadome.md) | [Русский](../ru/datadome.md) | [简体中文](../zh-CN/datadome.md) | [日本語](../ja/datadome.md) | **Português (Brasil)** | [Deutsch](../de/datadome.md) | [Français](../fr/datadome.md) | [한국어](../ko/datadome.md)

# Proteção antibot DataDome: como detectar (e o que ela significa para o web scraping)

DataDome é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o DataDome, quer detectar o DataDome em um site ou está investigando um web scraping bloqueado pelo DataDome, o primeiro passo é o mesmo: confirmar que é mesmo o DataDome que responde às suas requisições. Esta página lista os 13 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do DataDome, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A DataDome é uma fornecedora francesa de proteção contra bots e fraude online. Ela pontua as requisições com uma tag JavaScript e sinais do lado do servidor, e pode responder com um desafio ou uma página de bloqueio.

Site oficial: [https://datadome.co/](https://datadome.co/)

## Como saber se um site usa DataDome

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-datadome` (versão da regra 2.2.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^datadome$` | 100% | DataDome session cookie |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-datadome-cid$` | 100% | DataDome client ID response header |
| `^x-datadome$: ^protected$` | 100% | DataDome protection response header |
| `^server$: ^DataDome$` | 100% | Response served by DataDome itself (block or challenge page) |
| `^x-dd-b$` | 40% (apenas corroboração) | DataDome block-type header on challenge responses |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://(?:js\|api-js)\.datadome\.co/` | 100% | Official DataDome JavaScript tag or its collection endpoint |
| `^https://(?:[a-z0-9-]+\.)+captcha-delivery\.com(?:[/?#:]\|$)` | 100% | DataDome challenge or CAPTCHA delivery host |
| `^https?://[^/?#]+/(?:tags\.js\|js/)(?:[?#]\|$)` | 30% (apenas corroboração) | First-party tags.js or js/ collection path; the name is generic, corroboration only |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `ddjskey` | 25% | Integration snippet setting window.ddjskey |
| `var dd={'rt':` | 30% (apenas corroboração) | DataDome block page bootstrap (var dd={'rt':...}) |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `ddjskey (typeof string)` | 60% | DataDome JS key set by the integration snippet |
| `ddoptions (typeof object)` | 60% | DataDome tag options object (window.ddoptions) |
| `displayDataDomeResponsePage (typeof function)` | 85% | DataDome response page function (window.displayDataDomeResponsePage) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| DataDome tag with its session cookie | 100% | (Official DataDome JavaScript tag or its collection endpoint ou DataDome JS key set by the integration snippet ou Integration snippet setting window.ddjskey) e DataDome session cookie |
| DataDome response headers with its cookie | 100% | (DataDome client ID response header ou DataDome protection response header ou Response served by DataDome itself (block or challenge page)) e DataDome session cookie |
| First-party DataDome tag with its JS key | 85% | First-party tags.js or js/ collection path; the name is generic, corroboration only e (DataDome JS key set by the integration snippet ou Integration snippet setting window.ddjskey ou DataDome tag options object (window.ddoptions)) |
| DataDome block page | 95% | (DataDome block page bootstrap (var dd={'rt':...}) ou DataDome response page function (window.displayDataDomeResponsePage)) e (DataDome client ID response header ou DataDome block-type header on challenge responses ou DataDome challenge or CAPTCHA delivery host ou DataDome session cookie) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o DataDome estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo DataDome sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o DataDome com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
