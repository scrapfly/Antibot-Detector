[English](../deepseek-pow.md) | [Español](../es/deepseek-pow.md) | [Русский](../ru/deepseek-pow.md) | [简体中文](../zh-CN/deepseek-pow.md) | [日本語](../ja/deepseek-pow.md) | [Português (Brasil)](../pt-BR/deepseek-pow.md) | **Deutsch** | [Français](../fr/deepseek-pow.md) | [한국어](../ko/deepseek-pow.md)

# DeepSeek PoW Bot-Schutz: so erkennen Sie ihn (und was er für Web Scraping bedeutet)

DeepSeek PoW ist ein Bot-Schutz bzw. eine Anti-Abuse-Schicht, die manche Websites vor ihre Seiten schalten. Wenn Sie DeepSeek PoW umgehen möchten, DeepSeek PoW auf einer Website erkennen wollen oder untersuchen, warum Web Scraping von DeepSeek PoW blockiert wird, ist der erste Schritt immer derselbe: Prüfen Sie, ob tatsächlich DeepSeek PoW Ihre Anfragen beantwortet. Diese Seite listet die 5 öffentlichen Signale auf, mit denen die Erweiterung Scrapfly Antibot Detector die Bot-Erkennung von DeepSeek PoW identifiziert, wie stark jedes einzelne Signal darauf hinweist und was das in der Regel für einen automatisierten Client bedeutet.

## Was es ist

Die Chat-Webanwendung von DeepSeek verlangt vom Browser, eine Proof-of-Work-Challenge zu lösen, bevor sie eine Chat-Anfrage annimmt. Es ist der eigene Schutz des Dienstes und kein Produkt, das anderen Websites angeboten wird.

Offizielle Website: [https://chat.deepseek.com/](https://chat.deepseek.com/)

## Woran erkenne ich, ob eine Website DeepSeek PoW nutzt?

Diese Signale werden aus den eigenen Erkennungsregeln der Erweiterung für `detect-deepseek-pow` erzeugt (Regelversion 2.1.1, zuletzt aktualisiert am 2026-11-04). Ein Signal ist nur ein Hinweis: Die Konfidenz gibt an, wie sicher sich die Erweiterung ist, wenn genau dieses eine Signal auftritt. Signale mit der Kennzeichnung „nur zur Bestätigung“ zählen nie allein, weil auch andere Produkte sie erzeugen können.

### Skript- und Anfrage-URLs

Adressen von Skripten, Frames und Anfragen, die die Seite lädt. Es handelt sich um Muster, die gegen die vollständige Adresse geprüft werden.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge(?:[?#]\|$)` | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| `^https://(?:fe-static\|chat)\.deepseek\.com/(?:chat/)?static/sha3_wasm_bg\.[0-9a-f]{6,16}\.wasm(?:[?#]\|$)` | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) |
| `^https://chat\.deepseek\.com/api/v\d{1,2}/chat/completion(?:[?#]\|$)` | 40% (nur zur Bestätigung) | Chat completion request, the path the proof of work is issued for |

### Anfrage- und Antwortdaten

Daten, die die Seite an eine passende Adresse sendet oder von ihr empfängt.

| Signal | Konfidenz | Worauf es hinweist |
| --- | --- | --- |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; body "target_path"\s*:\s*"/api/` | 100% | Challenge request naming the path it protects (target_path) |
| `URL ^https://chat\.deepseek\.com/api/v\d{1,2}/chat/create_pow_challenge ; response "algorithm"\s*:\s*"DeepSeekHashV1"` | 100% | Challenge response with the DeepSeekHashV1 proof-of-work algorithm |

### Kombinationen

Manche Signale erreichen zusammen eine höhere Bewertung als einzeln. Diese Kombinationen meldet die Erweiterung zusätzlich.

| Kombination | Konfidenz | Erforderlich |
| --- | --- | --- |
| Challenge requested and answered with a DeepSeekHashV1 challenge | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) und Challenge response with the DeepSeekHashV1 proof-of-work algorithm |
| Proof-of-work challenge requested for a protected path | 100% | Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) und Challenge request naming the path it protects (target_path) |
| WebAssembly solver loaded and a challenge requested | 100% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) und Proof-of-work challenge request (/api/v0/chat/create_pow_challenge) |
| WebAssembly solver loaded and a protected chat request sent | 90% | DeepSeekHashV1 WebAssembly solver (sha3_wasm_bg.<hash>.wasm) und Chat completion request, the path the proof of work is issued for |

## Schwierigkeit

**Mittel.** Mittel bedeutet, dass die Erweiterung diesen Schutz als echtes Hindernis einstuft: Rechnen Sie mit Prüfungen des Browsers, der Anfragedetails oder beidem, und damit, dass sich diese im Lauf der Zeit ändern.

Die Einstufung ist die eigene Faustregel der Erweiterung und keine Aussage des Anbieters; die Konfiguration einer Website kann dasselbe Produkt einfacher oder schwieriger machen.

## Was es für Web Scraping bedeutet

Wenn DeepSeek PoW im Einsatz ist, kann eine Anfrage, die nicht wie eine echte, konsistente Browsersitzung aussieht, herausgefordert, verzögert oder abgelehnt werden, und als Antwort erhalten Sie möglicherweise eine Challenge- oder Blockseite statt der gewünschten Inhalte. Was genau passiert, hängt davon ab, wie der Websitebetreiber das Produkt konfiguriert hat; das kann von Website zu Website unterschiedlich sein und sich ohne Vorankündigung ändern. Verstehen Sie eine Erkennung als Anlass, die tatsächlich erhaltene Antwort zu prüfen, nicht als Garantie für eine Blockade.

Wenn Sie durch DeepSeek PoW geschützte Seiten scrapen möchten, ohne die Umgehungslösungen selbst zu pflegen, lesen Sie die [Dokumentation zu Anti Scraping Protection](https://scrapfly.io/docs/scrape-api/anti-scraping-protection) und die [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started) von Scrapfly. Scrapen Sie nur, was Sie dürfen, und beachten Sie die Nutzungsbedingungen und die robots-Regeln der Website.

## Mit der Erweiterung erkennen

Installieren Sie den kostenlosen [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca) für Chrome und rufen Sie die Seite auf. Das Popup listet DeepSeek PoW mit Konfidenz, Schwierigkeit und den genau passenden Signalen auf. Mehr dazu in der [Projekt-README](../../README.de.md) oder unter [alle Anti-Bot-Schutzmaßnahmen, die die Erweiterung erkennt](README.md).
