[English](../cloudflare.md) | [Español](../es/cloudflare.md) | [Русский](../ru/cloudflare.md) | [简体中文](../zh-CN/cloudflare.md) | [日本語](../ja/cloudflare.md) | [Português (Brasil)](../pt-BR/cloudflare.md) | [Deutsch](../de/cloudflare.md) | [Français](../fr/cloudflare.md) | **한국어**

# Cloudflare Bot Management 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

Cloudflare Bot Management은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. Cloudflare Bot Management 우회 방법을 찾고 있거나, 사이트에서 Cloudflare Bot Management을(를) 감지하려 하거나, Cloudflare Bot Management이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 Cloudflare Bot Management인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 Cloudflare Bot Management 봇 탐지를 식별하는 데 쓰는 공개 신호 11개와 각 신호가 얼마나 강하게 Cloudflare Bot Management을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

Cloudflare Bot Management는 전 세계 네트워크에서 제공되는 Cloudflare의 유료 봇 탐지 제품입니다. Cloudflare는 무료 챌린지 페이지도 운영하므로, Cloudflare 챌린지가 보인다고 해서 유료 제품이 활성화되었다는 뜻은 아닙니다.

공식 사이트: [https://www.cloudflare.com/products/bot-management/](https://www.cloudflare.com/products/bot-management/)

## 사이트가 Cloudflare Bot Management을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-cloudflare`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.3.0, 최종 업데이트 2026-10-26)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 쿠키

페이지에서 설정된 쿠키 이름(값이 일치 대상인 경우 값 포함)입니다. 일반 단어가 아닌 한 패턴은 정규식입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^cf_clearance$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Challenge clearance cookie, set after passing a Cloudflare challenge |
| `^__cf_bm$ = ^[A-Za-z0-9_.-]{43}-[0-9]{10}\.[0-9]{5,8}-1\.[0-9]\.[0-9]\.[0-9]-[A-Za-z0-9_.-]{20,}` | 100% | Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode |
| `^cf_chl_rc_(?:i\|ni\|m)$` | 85% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) |

### 응답 헤더

페이지 또는 페이지의 요청이 반환하는 HTTP 응답 헤더입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^cf-mitigated$: ^challenge$` | 100% | Response header Cloudflare sends when it served a challenge page |
| `^server$: ^cloudflare$` | 15% (보조 근거로만 사용) | Served through Cloudflare; CDN delivery, not bot management on its own |

### 스크립트 및 요청 URL

페이지가 불러오는 스크립트, 프레임, 요청의 주소입니다. 전체 주소를 대상으로 매칭하는 패턴입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?orchestrate/(?:chl_page\|managed\|jsch\|captcha)/` | 100% | Challenge page orchestrator under /cdn-cgi/challenge-platform/ |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?scripts/jsd/(?:[0-9a-f]{6,20}/)?main\.js(?:[?#]\|$)` | 100% | Bot Management JavaScript detections script |
| `^https?://(?!challenges\.(?:cloudflare\.com\|cloudflare-cn\.com\|fed\.cloudflare\.com)/)[^/?#]+/cdn-cgi/challenge-platform/(?:h/[a-z0-9]+/)?jsd/oneshot/` | 100% | Bot Management JavaScript detections report (/cdn-cgi/challenge-platform/…/jsd/oneshot/) |
| `^https://challenges\.cloudflare\.com/` | 40% (보조 근거로만 사용) | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only |

### 페이지 및 스크립트 콘텐츠

페이지 또는 페이지의 스크립트 안에서 발견되는 텍스트입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `_cf_chl_opt` | 20% | Script reference to the _cf_chl_opt challenge options object |

### JavaScript 전역 변수(window)

페이지 자체의 JavaScript 컨텍스트가 `window`에 노출하는 속성입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `_cf_chl_opt (typeof object)` | 85% | Challenge options object present on a Cloudflare challenge page |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| Challenge page orchestrator and challenge options object | 100% | (Challenge page orchestrator under /cdn-cgi/challenge-platform/ 또는 Response header Cloudflare sends when it served a challenge page) 그리고 (Challenge options object present on a Cloudflare challenge page 또는 Script reference to the _cf_chl_opt challenge options object) |
| Clearance cookie with Bot Management cookie | 85% | Challenge clearance cookie, set after passing a Cloudflare challenge 그리고 (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode 또는 Served through Cloudflare; CDN delivery, not bot management on its own) |
| Bot Management script on a Cloudflare zone | 75% | Bot Management JavaScript detections script 그리고 (Bot Management cookie in its <token>-<timestamp.fraction>-1.x.x.x-<signature> shape; Cloudflare sets it on every zone with bot management or Bot Fight Mode 또는 Served through Cloudflare; CDN delivery, not bot management on its own) |
| Challenge host request on a Cloudflare zone with a challenge signal | 90% | Request to challenges.cloudflare.com; also used by Turnstile, so corroboration only 그리고 (Challenge clearance cookie, set after passing a Cloudflare challenge 또는 Challenge options object present on a Cloudflare challenge page 또는 Challenge page orchestrator under /cdn-cgi/challenge-platform/) |
| Challenge platform cookie with a Cloudflare clearance, server header or challenge | 95% | Cloudflare challenge platform cookie (cf_chl_rc_i, cf_chl_rc_ni, cf_chl_rc_m) 그리고 (Challenge clearance cookie, set after passing a Cloudflare challenge 또는 Served through Cloudflare; CDN delivery, not bot management on its own 또는 Challenge page orchestrator under /cdn-cgi/challenge-platform/ 또는 Challenge options object present on a Cloudflare challenge page) |

## 난이도

**보통.** 보통은 확장 프로그램이 이 보호 기술을 실질적인 장애물로 평가한다는 뜻입니다. 브라우저, 요청 세부 정보 또는 둘 다에 대한 검사가 있을 것으로 예상되며, 이 검사는 시간이 지나면서 바뀔 수 있습니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

Cloudflare Bot Management이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

Cloudflare Bot Management이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 Cloudflare Bot Management이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
