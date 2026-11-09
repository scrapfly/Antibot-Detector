[English](../sift.md) | [Español](../es/sift.md) | [Русский](../ru/sift.md) | [简体中文](../zh-CN/sift.md) | [日本語](../ja/sift.md) | **Português (Brasil)** | [Deutsch](../de/sift.md) | [Français](../fr/sift.md) | [한국어](../ko/sift.md)

# Proteção antibot Sift: como detectar (e o que ela significa para o web scraping)

Sift é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Sift, quer detectar o Sift em um site ou está investigando um web scraping bloqueado pelo Sift, o primeiro passo é o mesmo: confirmar que é mesmo o Sift que responde às suas requisições. Esta página lista os 6 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Sift, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Sift é uma plataforma de confiança digital e prevenção de fraude. O snippet dela na página informa à Sift dados do dispositivo e das visualizações de página para a pontuação de risco.

Site oficial: [https://sift.com/](https://sift.com/)

## Como saber se um site usa Sift

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-sift` (versão da regra 2.0.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^__ssid$` | 30% (apenas corroboração) | __ssid visitor cookie the Sift snippet sets |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://cdn\.(?:sift\|siftscience)\.com/(?:s\|js/s-\d+)\.js(?:[?#]\|$)` | 100% | Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host |
| `^https://hexagon-analytics\.com/images/\d+\.gif\?` | 100% | Sift page-view beacon to hexagon-analytics.com (images/<n>.gif) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `_sift\.push\(\s*\[\s*['\"]_setAccount['\"]` | 20% | Sift snippet account call in scripts (_sift.push(['_setAccount', ...])) |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `_sift (typeof object)` | 30% (apenas corroboração) | _sift command queue of the Sift snippet |
| `Sift (typeof string)` | 40% (apenas corroboração) | Sift global the Sift s.js sets once loaded |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Sift script or beacon with its runtime or cookie | 100% | (Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host ou Sift page-view beacon to hexagon-analytics.com (images/<n>.gif)) e (_sift command queue of the Sift snippet ou Sift global the Sift s.js sets once loaded ou __ssid visitor cookie the Sift snippet sets) |
| Sift command queue with the loaded s.js | 80% | _sift command queue of the Sift snippet e Sift global the Sift s.js sets once loaded |
| __ssid cookie with the Sift runtime | 85% | __ssid visitor cookie the Sift snippet sets e (_sift command queue of the Sift snippet ou Sift global the Sift s.js sets once loaded ou Sift snippet account call in scripts (_sift.push(['_setAccount', ...]))) |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Sift estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Sift sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Sift com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
