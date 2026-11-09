[English](../shapesecurity.md) | [Español](../es/shapesecurity.md) | [Русский](../ru/shapesecurity.md) | [简体中文](../zh-CN/shapesecurity.md) | [日本語](../ja/shapesecurity.md) | **Português (Brasil)** | [Deutsch](../de/shapesecurity.md) | [Français](../fr/shapesecurity.md) | [한국어](../ko/shapesecurity.md)

# Proteção antibot Shape Security: como detectar (e o que ela significa para o web scraping)

Shape Security é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Shape Security, quer detectar o Shape Security em um site ou está investigando um web scraping bloqueado pelo Shape Security, o primeiro passo é o mesmo: confirmar que é mesmo o Shape Security que responde às suas requisições. Esta página lista os 5 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Shape Security, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Shape Security, adquirida pela F5, criou uma defesa empresarial contra bots voltada a fraude, credential stuffing e automação nos fluxos de login e checkout.

Site oficial: [https://www.shapesecurity.com/products/bot-manager](https://www.shapesecurity.com/products/bot-manager)

## Como saber se um site usa Shape Security

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-shapesecurity` (versão da regra 2.1.0, última atualização 2026-10-16). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?seed=[A-Za-z0-9_-]{40,}` | 85% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{0,60}/ssx\.mod\.js(?:\?async)?(?:#\|$)` | 60% (apenas corroboração) | Shape ssx.mod.js loader (Target, Nordstrom) |
| `^https?://[^/?#]+/[A-Za-z0-9/_.-]{1,80}\.js\?(?:[^#]*&)?X-[A-Za-z0-9]{6,10}--z=q(?:&\|#\|$)` | 50% (apenas corroboração) | Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `__xr_bmobdb` | 10% | Shape runtime global reference |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `__xr_bmobdb (exists)` | 80% | Shape runtime global (__xr_bmobdb) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Seeded loader with its runtime | 100% | Shape loader with its long seed parameter (ssx.mod.js?seed=...) e (Shape runtime global (__xr_bmobdb) ou Shape runtime global reference ou Shape seeded-script marker parameter (X-xxxxxxxx--z=q)) |
| ssx.mod.js loader with the Shape runtime | 90% | Shape ssx.mod.js loader (Target, Nordstrom) e (Shape runtime global (__xr_bmobdb) ou Shape loader with its long seed parameter (ssx.mod.js?seed=...)) |
| ssx.mod.js loader with the seeded-script marker | 80% | Shape ssx.mod.js loader (Target, Nordstrom) e Shape seeded-script marker parameter (X-xxxxxxxx--z=q) |

## Dificuldade

**Alta.** Alta significa que a extensão avalia essa proteção como uma das mais difíceis de superar: ela costuma combinar verificações no lado do cliente com pontuação comportamental ou no servidor.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Shape Security estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Shape Security sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Shape Security com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
