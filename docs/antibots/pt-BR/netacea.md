[English](../netacea.md) | [Español](../es/netacea.md) | [Русский](../ru/netacea.md) | [简体中文](../zh-CN/netacea.md) | [日本語](../ja/netacea.md) | **Português (Brasil)** | [Deutsch](../de/netacea.md) | [Français](../fr/netacea.md) | [한국어](../ko/netacea.md)

# Proteção antibot Netacea: como detectar (e o que ela significa para o web scraping)

Netacea é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Netacea, quer detectar o Netacea em um site ou está investigando um web scraping bloqueado pelo Netacea, o primeiro passo é o mesmo: confirmar que é mesmo o Netacea que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Netacea, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Netacea é uma fornecedora de gerenciamento de bots que funciona sem um script de página em cada requisição, lendo o tráfego na borda ou no servidor. Seus cookies são o vestígio visível habitual, e os nomes podem ser alterados para cada cliente.

Site oficial: [https://www.netacea.com/](https://www.netacea.com/)

## Como saber se um site usa Netacea

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-netacea` (versão da regra 2.2.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^_mitata$` | 60% | Netacea mitigation cookie, in the browser or set by the server (default name) |
| `^_mitatacaptcha$` | 100% | Netacea captcha-serving cookie (default name) |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https?://[^/?#]+/AtaVerifyCaptcha(?:[?#]\|$)` | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Captcha cookie with a mitigation cookie | 100% | Netacea captcha-serving cookie (default name) e Netacea mitigation cookie, in the browser or set by the server (default name) |
| Captcha verification with a Netacea cookie | 100% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) e Netacea captcha-serving cookie (default name) |
| Captcha verification with the mitigation cookie | 95% | First-party Netacea captcha verification endpoint (default path in the vendor integrations) e Netacea mitigation cookie, in the browser or set by the server (default name) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Netacea estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Netacea sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Netacea com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
