[English](../sift.md) | [Español](../es/sift.md) | [Русский](../ru/sift.md) | [简体中文](../zh-CN/sift.md) | [日本語](../ja/sift.md) | [Português (Brasil)](../pt-BR/sift.md) | [Deutsch](../de/sift.md) | [Français](../fr/sift.md) | **한국어**

# Sift 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

Sift은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. Sift 우회 방법을 찾고 있거나, 사이트에서 Sift을(를) 감지하려 하거나, Sift이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 Sift인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 Sift 봇 탐지를 식별하는 데 쓰는 공개 신호 6개와 각 신호가 얼마나 강하게 Sift을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

Sift는 디지털 신뢰 및 사기 방지 플랫폼입니다. 페이지 스니펫이 기기 및 페이지뷰 데이터를 Sift로 보내 위험 점수 산정에 사용합니다.

공식 사이트: [https://sift.com/](https://sift.com/)

## 사이트가 Sift을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-sift`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.0.0, 최종 업데이트 2026-10-26)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 쿠키

페이지에서 설정된 쿠키 이름(값이 일치 대상인 경우 값 포함)입니다. 일반 단어가 아닌 한 패턴은 정규식입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^__ssid$` | 30% (보조 근거로만 사용) | __ssid visitor cookie the Sift snippet sets |

### 스크립트 및 요청 URL

페이지가 불러오는 스크립트, 프레임, 요청의 주소입니다. 전체 주소를 대상으로 매칭하는 패턴입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^https://cdn\.(?:sift\|siftscience)\.com/(?:s\|js/s-\d+)\.js(?:[?#]\|$)` | 100% | Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host |
| `^https://hexagon-analytics\.com/images/\d+\.gif\?` | 100% | Sift page-view beacon to hexagon-analytics.com (images/<n>.gif) |

### 페이지 및 스크립트 콘텐츠

페이지 또는 페이지의 스크립트 안에서 발견되는 텍스트입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `_sift\.push\(\s*\[\s*['\"]_setAccount['\"]` | 20% | Sift snippet account call in scripts (_sift.push(['_setAccount', ...])) |

### JavaScript 전역 변수(window)

페이지 자체의 JavaScript 컨텍스트가 `window`에 노출하는 속성입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `_sift (typeof object)` | 30% (보조 근거로만 사용) | _sift command queue of the Sift snippet |
| `Sift (typeof string)` | 40% (보조 근거로만 사용) | Sift global the Sift s.js sets once loaded |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| Sift script or beacon with its runtime or cookie | 100% | (Sift JavaScript snippet s.js on cdn.sift.com or the former cdn.siftscience.com host 또는 Sift page-view beacon to hexagon-analytics.com (images/<n>.gif)) 그리고 (_sift command queue of the Sift snippet 또는 Sift global the Sift s.js sets once loaded 또는 __ssid visitor cookie the Sift snippet sets) |
| Sift command queue with the loaded s.js | 80% | _sift command queue of the Sift snippet 그리고 Sift global the Sift s.js sets once loaded |
| __ssid cookie with the Sift runtime | 85% | __ssid visitor cookie the Sift snippet sets 그리고 (_sift command queue of the Sift snippet 또는 Sift global the Sift s.js sets once loaded 또는 Sift snippet account call in scripts (_sift.push(['_setAccount', ...]))) |

## 난이도

**낮음.** 낮음은 확장 프로그램이 이 보호 기술을 가벼운 장애물로 평가한다는 뜻입니다. 대개 단순한 클라이언트만 걸러 내며, 실제 브라우저나 브라우저와 비슷하게 잘 구성한 요청은 통과하는 경우가 많습니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

Sift이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

Sift이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 Sift이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
