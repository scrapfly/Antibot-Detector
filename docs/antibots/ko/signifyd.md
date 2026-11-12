[English](../signifyd.md) | [Español](../es/signifyd.md) | [Русский](../ru/signifyd.md) | [简体中文](../zh-CN/signifyd.md) | [日本語](../ja/signifyd.md) | [Português (Brasil)](../pt-BR/signifyd.md) | [Deutsch](../de/signifyd.md) | [Français](../fr/signifyd.md) | **한국어**

# Signifyd 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

Signifyd은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. Signifyd 우회 방법을 찾고 있거나, 사이트에서 Signifyd을(를) 감지하려 하거나, Signifyd이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 Signifyd인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 Signifyd 봇 탐지를 식별하는 데 쓰는 공개 신호 9개와 각 신호가 얼마나 강하게 Signifyd을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

Signifyd는 온라인 상점이 사용하는 커머스 사기 방지 플랫폼입니다. 기기 프로파일링 스크립트가 상점 페이지에서 기기와 브라우저 데이터를 수집하여 Signifyd가 주문의 사기 위험을 평가하는 데 사용합니다.

공식 사이트: [https://www.signifyd.com/](https://www.signifyd.com/)

## 사이트가 Signifyd을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-signifyd`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.0.0, 최종 업데이트 2026-11-12)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 스크립트 및 요청 URL

페이지가 불러오는 스크립트, 프레임, 요청의 주소입니다. 전체 주소를 대상으로 매칭하는 패턴입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^https://cdn-scripts\.signifyd\.com/(?:api\|bigcommerce\|shopify)/script-tag\.js(?:[?#]\|$)` | 100% | Signifyd device profiling script script-tag.js on cdn-scripts.signifyd.com (standard, BigCommerce or Shopify) |
| `^https://cdn-scripts\.signifyd\.com/(?:api/company_toolkit\|o/(?:loader\|lite)\|bigcommerce/conversion-tracking)\.js(?:[?#]\|$)` | 100% | Other Signifyd scripts on cdn-scripts.signifyd.com (company_toolkit.js, loader.js, lite.js, BigCommerce conversion-tracking.js) |
| `^https://dp\.signifyd\.com/fp-web(?:[?#]\|$)` | 100% | Device profile sent to dp.signifyd.com/fp-web |
| `^https?://[^/?#]+/api/script-tag\.js(?:[?#]\|$)` | 40% (보조 근거로만 사용) | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only |
| `^https?://[^/?#]+/o/lite\.js(?:[?#]\|$)` | 30% (보조 근거로만 사용) | First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only |
| `^https?://[^/?#]+/fp-web(?:[?#]\|$)` | 30% (보조 근거로만 사용) | First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |

### JavaScript 전역 변수(window)

페이지 자체의 JavaScript 컨텍스트가 `window`에 노출하는 속성입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `signifyd.pageView (typeof function)` | 60% | signifyd.pageView method the Signifyd script exposes for single-page applications |
| `sigScriptLoader (typeof object)` | 60% | sigScriptLoader object of the Signifyd script, with its isInitialized flag |

### DOM 요소

CSS 선택자로 매칭되는 요소입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `script#script-tag-api[data-order-session-id], script#sig-api[data-order-session-id], script#sig-bc[data-store-id]` | 60% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| Signifyd script tag served from the site with its profiling routes | 100% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute 그리고 First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only 그리고 (First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only 또는 First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only) |
| Signifyd script tag with its runtime | 95% | Signifyd script tag with a documented id and its data-order-session-id or data-store-id attribute 그리고 (signifyd.pageView method the Signifyd script exposes for single-page applications 또는 sigScriptLoader object of the Signifyd script, with its isInitialized flag) |
| All three Signifyd routes served from the site | 85% | First-party /api/script-tag.js, the path Signifyd's proxy guide keeps for its script; supporting signal only 그리고 First-party /o/lite.js profiling module path from Signifyd's proxy guide; supporting signal only 그리고 First-party /fp-web profiling endpoint from Signifyd's proxy guide; supporting signal only |
| Signifyd loader and page-view method | 85% | signifyd.pageView method the Signifyd script exposes for single-page applications 그리고 sigScriptLoader object of the Signifyd script, with its isInitialized flag |

## 난이도

**낮음.** 낮음은 확장 프로그램이 이 보호 기술을 가벼운 장애물로 평가한다는 뜻입니다. 대개 단순한 클라이언트만 걸러 내며, 실제 브라우저나 브라우저와 비슷하게 잘 구성한 요청은 통과하는 경우가 많습니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

Signifyd이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

Signifyd이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 Signifyd이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
