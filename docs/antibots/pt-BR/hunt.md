[English](../hunt.md) | [Español](../es/hunt.md) | [Русский](../ru/hunt.md) | [简体中文](../zh-CN/hunt.md) | [日本語](../ja/hunt.md) | **Português (Brasil)** | [Deutsch](../de/hunt.md) | [Français](../fr/hunt.md) | [한국어](../ko/hunt.md)

# Proteção antibot Hunt: como detectar (e o que ela significa para o web scraping)

Hunt é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Hunt, quer detectar o Hunt em um site ou está investigando um web scraping bloqueado pelo Hunt, o primeiro passo é o mesmo: confirmar que é mesmo o Hunt que responde às suas requisições. Esta página lista os 4 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Hunt, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Hunt é um sistema antibot visto em algumas plataformas de apostas. Ele coleta uma impressão digital do navegador e pode dar sequência com um captcha interativo quando decide bloquear.

Site oficial: [https://docs.capmonster.cloud/docs/captchas/hunt-task/](https://docs.capmonster.cloud/docs/captchas/hunt-task/)

## Como saber se um site usa Hunt

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-hunt` (versão da regra 2.2.0, última atualização 2026-10-17). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/hd-api/external/apps/[0-9A-Za-z_-]+/api\.js(?:[?#]\|$)` | 60% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/assets/hdf\.js(?:[?#]\|$)` | 45% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| `^https?://[^/?#]+/hd-api/external/verify(?:[/?#]\|$)` | 50% | Hunt verify request that sends the browser check (hd-api/external/verify) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `/hd-api/external/apps/` | 15% | Script reference to the Hunt hd-api path |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Hunt loader with its fingerprint script | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host e Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host |
| Hunt loader with a verify request | 90% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host e Hunt verify request that sends the browser check (hd-api/external/verify) |
| Fingerprint script with a verify request | 85% | Hunt fingerprint script (hd-api/external/assets/hdf.js) on the site's own host e Hunt verify request that sends the browser check (hd-api/external/verify) |
| Hunt loader requested and referenced in page scripts | 75% | Hunt loader script (hd-api/external/apps/<hash>/api.js) on the site's own host e Script reference to the Hunt hd-api path |

## Dificuldade

**Alta.** Alta significa que a extensão avalia essa proteção como uma das mais difíceis de superar: ela costuma combinar verificações no lado do cliente com pontuação comportamental ou no servidor.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Hunt estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Hunt sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Hunt com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
