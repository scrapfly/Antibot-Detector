[English](../amazon.md) | [Español](../es/amazon.md) | [Русский](../ru/amazon.md) | [简体中文](../zh-CN/amazon.md) | [日本語](../ja/amazon.md) | **Português (Brasil)** | [Deutsch](../de/amazon.md) | [Français](../fr/amazon.md) | [한국어](../ko/amazon.md)

# Proteção antibot Amazon Bot Protection: como detectar (e o que ela significa para o web scraping)

Amazon Bot Protection é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Amazon Bot Protection, quer detectar o Amazon Bot Protection em um site ou está investigando um web scraping bloqueado pelo Amazon Bot Protection, o primeiro passo é o mesmo: confirmar que é mesmo o Amazon Bot Protection que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Amazon Bot Protection, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

As páginas de login da Amazon coletam uma impressão digital do navegador no lado do cliente, que o formulário de login envia junto com as credenciais. Ela faz parte das ferramentas antiabuso da própria Amazon, e não de um produto que outros sites possam comprar.

Site oficial: [https://www.amazon.com/](https://www.amazon.com/)

## Como saber se um site usa Amazon Bot Protection

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-amazon` (versão da regra 2.1.1, última atualização 2026-11-04). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%._-]+\.js\?AUIClients/FWCIMAssets(?:[#&]\|$)` | 100% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `fwcimCmd` | 30% (apenas corroboração) | Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

### Elementos do DOM

Elementos encontrados por seletor CSS.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `input[name="metadata1"]` | 80% (apenas corroboração) | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| metadata1 field with the FWCIM script loaded | 100% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint e FWCIM fingerprinting bundle loaded on Amazon sign-in pages |
| metadata1 field with FWCIM profiling started | 90% | Hidden metadata1 field of the sign-in form, which carries the encrypted FWCIM fingerprint e Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |
| FWCIM script loaded and profiling started | 85% | FWCIM fingerprinting bundle loaded on Amazon sign-in pages e Inline fwcimCmd queue that starts FWCIM profiling of the sign-in form |

## Dificuldade

**Alta.** Alta significa que a extensão avalia essa proteção como uma das mais difíceis de superar: ela costuma combinar verificações no lado do cliente com pontuação comportamental ou no servidor.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Amazon Bot Protection estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Amazon Bot Protection sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Amazon Bot Protection com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
