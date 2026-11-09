[English](../deepseek-pow.md) | [Español](../es/deepseek-pow.md) | [Русский](../ru/deepseek-pow.md) | [简体中文](../zh-CN/deepseek-pow.md) | [日本語](../ja/deepseek-pow.md) | **Português (Brasil)** | [Deutsch](../de/deepseek-pow.md) | [Français](../fr/deepseek-pow.md) | [한국어](../ko/deepseek-pow.md)

# Proteção antibot DeepSeek PoW: como detectar (e o que ela significa para o web scraping)

DeepSeek PoW é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o DeepSeek PoW, quer detectar o DeepSeek PoW em um site ou está investigando um web scraping bloqueado pelo DeepSeek PoW, o primeiro passo é o mesmo: confirmar que é mesmo o DeepSeek PoW que responde às suas requisições. Esta página lista os 5 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do DeepSeek PoW, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O aplicativo web de chat da DeepSeek pede ao navegador que resolva um desafio de prova de trabalho antes de aceitar uma requisição de chat. É a proteção do próprio serviço, e não um produto vendido a outros sites.

Site oficial: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## Como saber se um site usa DeepSeek PoW

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-deepseek-pow` (versão da regra 2.1.1, última atualização 2026-11-04). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (apenas corroboração) | Chat completion request, the path the proof of work is issued for |

### Payloads de requisição e resposta

Dados que a página envia para um endereço correspondente, ou recebe dele.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) e Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) e Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) e Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) e Chat completion request, the path the proof of work is issued for |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o DeepSeek PoW estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo DeepSeek PoW sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o DeepSeek PoW com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
