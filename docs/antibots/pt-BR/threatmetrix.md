[English](../threatmetrix.md) | [Español](../es/threatmetrix.md) | [Русский](../ru/threatmetrix.md) | [简体中文](../zh-CN/threatmetrix.md) | [日本語](../ja/threatmetrix.md) | **Português (Brasil)** | [Deutsch](../de/threatmetrix.md) | [Français](../fr/threatmetrix.md) | [한국어](../ko/threatmetrix.md)

# Proteção antibot ThreatMetrix: como detectar (e o que ela significa para o web scraping)

ThreatMetrix é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o ThreatMetrix, quer detectar o ThreatMetrix em um site ou está investigando um web scraping bloqueado pelo ThreatMetrix, o primeiro passo é o mesmo: confirmar que é mesmo o ThreatMetrix que responde às suas requisições. Esta página lista os 6 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do ThreatMetrix, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O ThreatMetrix é um serviço de identificação de dispositivos e prevenção de fraude que hoje pertence à LexisNexis Risk Solutions. Ele cria o perfil do dispositivo do visitante e envia o resultado a um mecanismo de decisão.

Site oficial: [https://www.threatmetrix.com/](https://www.threatmetrix.com/)

## Como saber se um site usa ThreatMetrix

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-threatmetrix` (versão da regra 2.3.0, última atualização 2026-10-17). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=` | 100% | ThreatMetrix profiling tag (fp/tags.js?org_id=...) |
| `^https://(?:h\.online-metrix\.net\|[a-z0-9-]+\.online-metrix\.net)/fp/(?:check\.js\|clear\.png\|sym\.map\|ls_fp\.html)` | 100% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| `^https?://[^/?#]+/fp/tags(?:\.js)?\?(?:[^#]*&)?org_id=[A-Za-z0-9]{6,12}&(?:[^#]*&)?session_id=` | 50% (apenas corroboração) | First-party (CNAME) ThreatMetrix tag with org_id and session_id |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `tmx_(?:profiling_started\|run_page_fingerprinting)` | 10% | ThreatMetrix profiling globals in scripts |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `tmx_profiling_started (typeof boolean)` | 70% | ThreatMetrix profiling flag |
| `tmx_run_page_fingerprinting (typeof function)` | 60% | ThreatMetrix page fingerprint function |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Profiling tag with its runtime | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) ou First-party (CNAME) ThreatMetrix tag with org_id and session_id) e (ThreatMetrix profiling flag ou ThreatMetrix page fingerprint function ou ThreatMetrix profiling globals in scripts) |
| Profiling tag with its follow-up resources | 100% | (ThreatMetrix profiling tag (fp/tags.js?org_id=...) ou First-party (CNAME) ThreatMetrix tag with org_id and session_id) e ThreatMetrix profiling resource (check.js, sym.map, clear.png) |
| Profiling resource with its runtime | 85% | ThreatMetrix profiling resource (check.js, sym.map, clear.png) e (ThreatMetrix profiling flag ou ThreatMetrix page fingerprint function) |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o ThreatMetrix estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo ThreatMetrix sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o ThreatMetrix com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
