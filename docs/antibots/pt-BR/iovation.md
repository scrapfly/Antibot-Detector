[English](../iovation.md) | [Español](../es/iovation.md) | [Русский](../ru/iovation.md) | [简体中文](../zh-CN/iovation.md) | [日本語](../ja/iovation.md) | **Português (Brasil)** | [Deutsch](../de/iovation.md) | [Français](../fr/iovation.md) | [한국어](../ko/iovation.md)

# Proteção antibot iovation (TransUnion TruValidate): como detectar (e o que ela significa para o web scraping)

iovation (TransUnion TruValidate) é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o iovation (TransUnion TruValidate), quer detectar o iovation (TransUnion TruValidate) em um site ou está investigando um web scraping bloqueado pelo iovation (TransUnion TruValidate), o primeiro passo é o mesmo: confirmar que é mesmo o iovation (TransUnion TruValidate) que responde às suas requisições. Esta página lista os 9 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do iovation (TransUnion TruValidate), o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A iovation é um serviço de reconhecimento de dispositivos e prevenção de fraude que hoje faz parte da TransUnion como TruValidate. O script dela coleta uma blackbox do dispositivo que o site envia em ações sensíveis.

Site oficial: [https://www.iovation.com/](https://www.iovation.com/)

## Como saber se um site usa iovation (TransUnion TruValidate)

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-iovation` (versão da regra 2.0.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^(?:https\|wss)://(?:ci-)?mpsnare\.iesnare\.com/` | 100% | iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) |
| `^https://(?:ci-)?(?:mpsnare\|first)\.iovation\.com/` | 100% | iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors) |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?(?:static_\|dyn_)?wdp\.js(?:[?#]\|$)` | 80% | iovation wdp.js profiling script served through the site's own /iojs/ proxy |
| `^https?://[^/?#]+/iojs/(?:latest\|general5\|\d+\.\d+\.\d+)/(?:[^?#]*/)?logo\.js(?:[?#]\|$)` | 40% (apenas corroboração) | iovation logo.js served through the site's own /iojs/ proxy |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `\bio_(?:global_object_name\|bbout_element_id)\b` | 30% (apenas corroboração) | iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `IGLOO.getBlackbox (typeof function)` | 70% | IGLOO.getBlackbox function of the iovation loader |
| `IGLOO.fp (typeof object)` | 50% (apenas corroboração) | IGLOO.fp object created by the iovation profiling scripts |
| `io_global_object_name (typeof string)` | 30% (apenas corroboração) | io_global_object_name setting read by the iovation scripts |

### Elementos do DOM

Elementos encontrados por seletor CSS.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `input[type='hidden']#ioBlackBox` | 30% (apenas corroboração) | Hidden ioBlackBox field that receives the iovation blackbox |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| iovation script with its IGLOO runtime | 100% | (iovation device profiling script or socket on the vendor iesnare.com host (snare.js, wdp.js, logo.js) ou iovation script on the vendor iovation.com hosts (ci-mpsnare snare.js, first and ci-first collectors)) e (IGLOO.getBlackbox function of the iovation loader ou IGLOO.fp object created by the iovation profiling scripts) |
| First-party iovation scripts with their runtime | 100% | (iovation wdp.js profiling script served through the site's own /iojs/ proxy ou iovation logo.js served through the site's own /iojs/ proxy) e (IGLOO.getBlackbox function of the iovation loader ou IGLOO.fp object created by the iovation profiling scripts ou io_global_object_name setting read by the iovation scripts) |
| iovation runtime with its configuration | 85% | (IGLOO.getBlackbox function of the iovation loader ou IGLOO.fp object created by the iovation profiling scripts) e (io_global_object_name setting read by the iovation scripts ou iovation configuration globals in scripts (io_global_object_name, io_bbout_element_id) ou Hidden ioBlackBox field that receives the iovation blackbox) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o iovation (TransUnion TruValidate) estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo iovation (TransUnion TruValidate) sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o iovation (TransUnion TruValidate) com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
