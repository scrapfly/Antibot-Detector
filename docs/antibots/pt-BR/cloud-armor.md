[English](../cloud-armor.md) | [Español](../es/cloud-armor.md) | [Русский](../ru/cloud-armor.md) | [简体中文](../zh-CN/cloud-armor.md) | [日本語](../ja/cloud-armor.md) | **Português (Brasil)** | [Deutsch](../de/cloud-armor.md) | [Français](../fr/cloud-armor.md) | [한국어](../ko/cloud-armor.md)

# Proteção antibot Google Cloud Armor: como detectar (e o que ela significa para o web scraping)

Google Cloud Armor é uma camada de proteção contra bots ou contra abuso que alguns sites colocam na frente de suas páginas. Se você procura como contornar o Google Cloud Armor, quer detectar o Google Cloud Armor em um site ou está investigando um web scraping bloqueado pelo Google Cloud Armor, o primeiro passo é o mesmo: confirmar que é mesmo o Google Cloud Armor que responde às suas requisições. Esta página lista os 3 sinais públicos que a extensão Scrapfly Antibot Detector usa para reconhecer a detecção de bots do Google Cloud Armor, o quanto cada um aponta para ele e o que isso costuma significar para um cliente automatizado.

## O que é

O Google Cloud Armor é o serviço de WAF e proteção contra DDoS que fica na frente dos balanceadores de carga do Google Cloud. O gerenciamento de bots dele usa o reCAPTCHA para desafiar os visitantes e verificar os tokens que o reCAPTCHA deixa no navegador.

Site oficial: [https://cloud.google.com/security/products/armor](https://cloud.google.com/security/products/armor)

## Como saber se um site usa Google Cloud Armor

Estes sinais são gerados a partir das regras de detecção da própria extensão para `detect-cloud-armor` (versão da regra 2.0.0, última atualização 2026-11-12). Um sinal é apenas um indício: a confiança indica o quanto a extensão tem certeza quando vê aquele sinal isolado. Os sinais marcados como "apenas corroboração" nunca contam por si sós, porque outros produtos também podem produzi-los.

### Cookies

Nomes de cookies (e valores, quando algum é comparado) definidos na página. Os padrões são expressões regulares, a menos que sejam palavras simples.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^recaptcha-ca-e$` | 90% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) |
| `^recaptcha-ca-t$` | 70% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |

### URLs de scripts e requisições

Endereços de scripts, frames e requisições que a página carrega. São padrões comparados com o endereço completo.

| Sinal | Confiança | O que indica |
| --- | --- | --- |
| `^https://www\.(?:google\.com\|recaptcha\.net)/recaptcha/(?:api\|enterprise)\.js\?(?:[^#]*&)?waf=session(?:[&#]\|$)` | 50% (apenas corroboração) | reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

### Combinações

Alguns sinais pontuam mais juntos do que sozinhos. A extensão também relata essas combinações.

| Combinação | Confiança | Requer |
| --- | --- | --- |
| Exemption cookie and session-token cookie | 100% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) e recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) |
| Session-token cookie with the reCAPTCHA script that sets it | 85% | recaptcha-ca-t session-token cookie that reCAPTCHA for WAF sets for Cloud Armor rules to check (Google Cloud docs) e reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |
| Exemption cookie with a reCAPTCHA for WAF session-token script | 95% | recaptcha-ca-e exemption cookie issued after a visitor passes the Cloud Armor reCAPTCHA challenge (Google Cloud docs) e reCAPTCHA script loaded with waf=session, the session-token setup of reCAPTCHA for WAF; supporting signal only |

## Dificuldade

**Média.** Média significa que a extensão avalia essa proteção como um obstáculo real: espere verificações no navegador, nos detalhes da requisição ou em ambos, e espere que elas mudem com o tempo.

A classificação é uma regra prática da própria extensão, não uma declaração do fornecedor, e a configuração de um site pode tornar o mesmo produto mais fácil ou mais difícil de contornar.

## O que significa para o scraping

Se o Google Cloud Armor estiver presente, uma requisição que não pareça uma sessão de navegador real e consistente pode ser desafiada, atrasada ou recusada, e a resposta pode ser uma página de desafio ou de bloqueio em vez do conteúdo que você queria. O que exatamente acontece depende de como o responsável pelo site configurou o produto, o que pode variar de um site para outro e mudar sem aviso. Trate uma detecção como um motivo para examinar a resposta que você realmente recebe, não como garantia de bloqueio.

Para fazer scraping de páginas protegidas pelo Google Cloud Armor sem precisar manter você mesmo as soluções de contorno, veja a [documentação do Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) e a [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) da Scrapfly. Faça scraping apenas do que você tem permissão para acessar e respeite os termos do site e as regras de robots.

## Detecte com a extensão

Instale o [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) gratuito para Chrome, acesse a página, e o popup lista o Google Cloud Armor com sua confiança, sua dificuldade e os sinais exatos que foram encontrados. Saiba mais no [README do projeto](../../README.pt-BR.md) ou veja [todas as proteções antibot que a extensão detecta](README.md).
