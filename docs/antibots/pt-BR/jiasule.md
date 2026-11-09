[English](../jiasule.md) | [Español](../es/jiasule.md) | [Русский](../ru/jiasule.md) | [简体中文](../zh-CN/jiasule.md) | [日本語](../ja/jiasule.md) | **Português (Brasil)** | [Deutsch](../de/jiasule.md) | [Français](../fr/jiasule.md) | [한국어](../ko/jiasule.md)

# Proteção antibot Jiasule (Chuangyu Shield): como detectar (e o que ela significa para o web scraping)

Jiasule (Chuangyu Shield) é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Jiasule (Chuangyu Shield), quer detectar o Jiasule (Chuangyu Shield) em um site ou está investigando um web scraping bloqueado pelo Jiasule (Chuangyu Shield), o primeiro passo é o mesmo: confirmar que é mesmo o Jiasule (Chuangyu Shield) que responde às suas requisições. Esta página lista os 7 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Jiasule (Chuangyu Shield), o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Jiasule, também escrito Chuangyu Shield, é um serviço de proteção anti-DDoS e web da Knownsec, na China. Ele costuma apresentar um portão de JavaScript antes de carregar a página.

Site oficial: [https://www.jiasule.com/](https://www.jiasule.com/)

## Como saber se um site usa Jiasule (Chuangyu Shield)

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-jiasule` (versão da regra 2.2.0, última atualização 2026-10-16). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^__jsl_clearance_s$` | 100% | Jiasule JavaScript-challenge clearance cookie |
| `^__jsluid_s?$` | 60% | Jiasule visitor id cookie set on first request |
| `^jsl_tracking` | 40% (apenas corroboração) | Jiasule tracking cookie set alongside the challenge cookies |

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-via-jsl$: ^[0-9a-f]{7},` | 75% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response |
| `^server$: ^jiasule-waf$` | 70% | Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server) |

### Conteúdo da página e dos scripts

Texto encontrado dentro da página ou de seus scripts.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `static.jiasule.com` | 15% | Script reference to Jiasule static challenge assets |
| `365cyd.com` | 15% | Script reference to the Chuangyu (365cyd) customer portal host |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Clearance cookie with the visitor id cookie | 85% | Jiasule JavaScript-challenge clearance cookie e Jiasule visitor id cookie set on first request |
| Jiasule edge header with a Jiasule session cookie | 90% | (X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response ou Server header identifying the Jiasule WAF edge (legacy; current edges send nginx or no Server)) e (Jiasule visitor id cookie set on first request ou Jiasule tracking cookie set alongside the challenge cookies) |
| Edge header, visitor id and passed JS challenge | 100% | X-Via-JSL edge header sent by the Jiasule / Chuangyu Shield edge on every protected response e Jiasule visitor id cookie set on first request e Jiasule JavaScript-challenge clearance cookie |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Jiasule (Chuangyu Shield) estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Jiasule (Chuangyu Shield) sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Jiasule (Chuangyu Shield) com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
