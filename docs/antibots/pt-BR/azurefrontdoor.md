[English](../azurefrontdoor.md) | [Español](../es/azurefrontdoor.md) | [Русский](../ru/azurefrontdoor.md) | [简体中文](../zh-CN/azurefrontdoor.md) | [日本語](../ja/azurefrontdoor.md) | **Português (Brasil)** | [Deutsch](../de/azurefrontdoor.md) | [Français](../fr/azurefrontdoor.md) | [한국어](../ko/azurefrontdoor.md)

# Proteção antibot Azure Front Door: como detectar (e o que ela significa para o web scraping)

Azure Front Door é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Azure Front Door, quer detectar o Azure Front Door em um site ou está investigando um web scraping bloqueado pelo Azure Front Door, o primeiro passo é o mesmo: confirmar que é mesmo o Azure Front Door que responde às suas requisições. Esta página lista os 4 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Azure Front Door, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Azure Front Door é o serviço global de entrega de conteúdo e de aplicações da Microsoft para o Azure. Ele pode ser combinado com o firewall de aplicações web do Azure, então vê-lo indica a borda na frente de um site, e nem sempre que os bots são filtrados.

Site oficial: [https://azure.microsoft.com/products/frontdoor](https://azure.microsoft.com/products/frontdoor)

## Como saber se um site usa Azure Front Door

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-azurefrontdoor` (versão da regra 2.1.0, última atualização 2026-10-26). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cabeçalhos de resposta

Cabeçalhos de resposta HTTP que a página ou suas requisições retornam.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^x-azure-ref$` | 40% | Azure Front Door request reference header on every edge response |
| `^x-cache$: ^(?:TCP_(?:HIT\|MISS\|REMOTE_HIT)\|CONFIG_NOCACHE\|PRIVATE_NOSTORE\|UNCACHEABLE)$` | 35% (apenas corroboração) | Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| `^x-fd-int-roxy-purgeid$` | 45% | Internal Front Door purge-id header on cached responses |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://[^/?#]+\.azurefd\.net(?:[/?#]\|$)` | 40% | Resource served from an azurefd.net Front Door endpoint host |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Front Door reference header with the edge cache header | 55% | Azure Front Door request reference header on every edge response e Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) |
| Front Door reference with its purge-id header | 60% | Azure Front Door request reference header on every edge response e Internal Front Door purge-id header on cached responses |
| Front Door endpoint host with an edge response header | 60% | Resource served from an azurefd.net Front Door endpoint host e (Azure Front Door request reference header on every edge response ou Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count)) |
| Front Door reference header, cache header and endpoint host | 70% | Azure Front Door request reference header on every edge response e Azure Front Door cache status values in X-Cache (generic HIT/MISS from other CDNs do not count) e Resource served from an azurefd.net Front Door endpoint host |

## Dificuldade

**Baixa.** Baixa significa que a extensão avalia essa proteção como um obstáculo leve: normalmente ela só filtra clientes simples, e um navegador real ou uma requisição bem formada, parecida com a de um navegador, muitas vezes passa.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Azure Front Door estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Azure Front Door sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Azure Front Door com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
