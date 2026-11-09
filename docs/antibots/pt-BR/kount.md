[English](../kount.md) | [Español](../es/kount.md) | [Русский](../ru/kount.md) | [简体中文](../zh-CN/kount.md) | [日本語](../ja/kount.md) | **Português (Brasil)** | [Deutsch](../de/kount.md) | [Français](../fr/kount.md) | [한국어](../ko/kount.md)

# Proteção antibot Kount: como detectar (e o que ela significa para o web scraping)

Kount é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Kount, quer detectar o Kount em um site ou está investigando um web scraping bloqueado pelo Kount, o primeiro passo é o mesmo: confirmar que é mesmo o Kount que responde às suas requisições. Esta página lista os 4 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Kount, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

A Kount, parte da Equifax, é uma empresa de prevenção de fraude em pagamentos. O Device Data Collector dela reúne informações do navegador que o backend do comerciante envia à Kount para uma decisão de risco.

Site oficial: [https://kount.com/](https://kount.com/)

## Como saber se um site usa Kount

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-kount` (versão da regra 2.0.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://(?:ssl\|tst)\.kaptcha\.com/collect/sdk\?(?:[^#]*&)?m=[0-9]{3,}(?:[&#]\|$)` | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) |
| `^https://(?:ssl\|tst)\.kaptcha\.com/(?:cs/(?:config\|generatecookie\|storecookie\|location)\|session/[A-Za-z0-9_-]+\|logo\.htm\|fin)(?:[?#]\|$)` | 100% | Kount Web SDK request to the vendor kaptcha.com collector |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `kaxsdc` | 20% | Script reference to the kaxsdc class that triggers Kount data collection |

### Variáveis globais de JavaScript (window)

Propriedades que o contexto JavaScript da própria página expõe em `window`.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `ka.ClientSDK (typeof function)` | 60% | ka.ClientSDK class of the Kount data collector |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Kount collector script with its class or trigger | 100% | Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) e (ka.ClientSDK class of the Kount data collector ou Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount collector request with its script or class | 95% | Kount Web SDK request to the vendor kaptcha.com collector e (Kount Device Data Collector script from the vendor kaptcha.com host (collect/sdk?m=<merchant id>) ou ka.ClientSDK class of the Kount data collector ou Script reference to the kaxsdc class that triggers Kount data collection) |
| Kount class with its trigger | 80% | ka.ClientSDK class of the Kount data collector e Script reference to the kaxsdc class that triggers Kount data collection |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Kount estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Kount sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Kount com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
