[English](../botguard.md) | [Español](../es/botguard.md) | [Русский](../ru/botguard.md) | [简体中文](../zh-CN/botguard.md) | [日本語](../ja/botguard.md) | **Português (Brasil)** | [Deutsch](../de/botguard.md) | [Français](../fr/botguard.md) | [한국어](../ko/botguard.md)

# Proteção antibot Google BotGuard: como detectar (e o que ela significa para o web scraping)

Google BotGuard é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Google BotGuard, quer detectar o Google BotGuard em um site ou está investigando um web scraping bloqueado pelo Google BotGuard, o primeiro passo é o mesmo: confirmar que é mesmo o Google BotGuard que responde às suas requisições. Esta página lista os 7 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Google BotGuard, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O BotGuard é a tecnologia própria do Google de verificação de integridade e detecção de bots no lado do cliente. É usada por serviços do Google e pelo reCAPTCHA, e o Google não divulga como ela funciona.

Site oficial: [https://developers.google.com/recaptcha](https://developers.google.com/recaptcha)

## Como saber se um site usa Google BotGuard

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-botguard` (versão da regra 2.3.0, última atualização 2026-10-17). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://www\.google\.com/js/th/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/th/<hash>.js) |
| `^https://www\.google\.com/js/bg/[A-Za-z0-9_-]{30,60}\.js(?:[?#]\|$)` | 100% | BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail |
| `^https://jnn-pa\.googleapis\.com/\$rpc/google\.internal\.waa\.v1\.Waa/(?:Create\|GenerateIT)(?:[?#]\|$)` | 100% | Web Anti-Abuse (BotGuard) attestation RPC |
| `^https://mail\.google\.com/mail/u/\d+/waa(?:[/?#]\|$)` | 100% | Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `bgChallenge` | 10% | BotGuard challenge config key in page data |
| `interpreterUrl` | 10% (apenas corroboração) | BotGuard interpreter URL key |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `trayride (exists)` | 50% (apenas corroboração) | BotGuard VM global (globalName from bgChallenge) |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Interpreter loaded and attestation sent | 100% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) ou BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) e (Web Anti-Abuse (BotGuard) attestation RPC ou Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) |
| Interpreter with its challenge config | 90% | (BotGuard interpreter script (//www.google.com/js/th/<hash>.js) ou BotGuard interpreter script (//www.google.com/js/bg/<hash>.js), as on Gmail) e (BotGuard challenge config key in page data ou BotGuard interpreter URL key ou BotGuard VM global (globalName from bgChallenge)) |
| Attestation RPC with the BotGuard VM | 85% | (Web Anti-Abuse (BotGuard) attestation RPC ou Gmail's Web Anti-Abuse (BotGuard) endpoint (/mail/u/<account>/waa)) e (BotGuard VM global (globalName from bgChallenge) ou BotGuard challenge config key in page data) |

## Dificuldade

**Alta.** Alta significa que a extensão avalia essa proteção como uma das mais difíceis de superar: ela costuma combinar verificações no lado do cliente com pontuação comportamental ou no servidor.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Google BotGuard estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Google BotGuard sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Google BotGuard com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
