[English](../radware.md) | [Español](../es/radware.md) | [Русский](../ru/radware.md) | [简体中文](../zh-CN/radware.md) | [日本語](../ja/radware.md) | [Português (Brasil)](../pt-BR/radware.md) | [Deutsch](../de/radware.md) | [Français](../fr/radware.md) | **한국어**

# Radware Bot Manager 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

Radware Bot Manager은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. Radware Bot Manager 우회 방법을 찾고 있거나, 사이트에서 Radware Bot Manager을(를) 감지하려 하거나, Radware Bot Manager이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 Radware Bot Manager인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 Radware Bot Manager 봇 탐지를 식별하는 데 쓰는 공개 신호 10개와 각 신호가 얼마나 강하게 Radware Bot Manager을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

Radware Bot Manager는 이전 이름이 ShieldSquare이며 Radware의 봇 관리 제품입니다. Radware는 클라우드 WAF도 판매하며, 이 탐지기는 둘 다의 흔적을 찾습니다.

공식 사이트: [https://www.radware.com/products/bot-manager/](https://www.radware.com/products/bot-manager/)

## 사이트가 Radware Bot Manager을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-radware`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.3.0, 최종 업데이트 2026-11-12)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 쿠키

페이지에서 설정된 쿠키 이름(값이 일치 대상인 경우 값 포함)입니다. 일반 단어가 아닌 한 패턴은 정규식입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^__uzm[a-f]$ = ^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|7f[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14}(?:-[0-9a-f]{8,24}){2}\|[0-9]{10,13})$` | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) |
| `^(?:__uzm[a-z]j\d\|__ssuzjsr\d\|uzmxj?)$` | 40% (보조 근거로만 사용) | Radware Bot Manager cookies written by its JavaScript |

### 응답 헤더

페이지 또는 페이지의 요청이 반환하는 HTTP 응답 헤더입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^x-sl-compstate$` | 60% | Radware SecureLink component-state response header |
| `^server$: ^rdwr$` | 70% | Server: rdwr sent by the Radware edge |

### 스크립트 및 요청 URL

페이지가 불러오는 스크립트, 프레임, 요청의 주소입니다. 전체 주소를 대상으로 매칭하는 패턴입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^https?://[^/?#]+/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|advanced(?:/ie)?)/stormcaster(?:v\d+)?\.js(?:[?#]\|$)` | 100% | First-party Radware Bot Manager script (stormcaster.js) |
| `^https://validate\.perfdrive\.com/` | 100% | Radware Bot Manager captcha / validation host |

### 페이지 및 스크립트 콘텐츠

페이지 또는 페이지의 스크립트 안에서 발견되는 텍스트입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `CloudWebSec[.@]radware\.com` | 20% (보조 근거로만 사용) | CloudWebSec contact address on the Radware block page |
| `Unauthorized Request Blocked` | 20% (보조 근거로만 사용) | Radware block-page message |

### JavaScript 전역 변수(window)

페이지 자체의 JavaScript 컨텍스트가 `window`에 노출하는 속성입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `SSJSConnectorObj (typeof object)` | 70% | Radware Bot Manager JavaScript connector object |
| `__uzdbm_1 (typeof string)` | 40% | Radware Bot Manager device-binding variable |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| Block-page message with the vendor portal reference | 70% | CloudWebSec contact address on the Radware block page 그리고 Radware block-page message |
| Component-state header with block-page evidence | 80% | Radware SecureLink component-state response header 그리고 (CloudWebSec contact address on the Radware block page 또는 Radware block-page message) |
| Component-state header with both block-page signals | 90% | Radware SecureLink component-state response header 그리고 CloudWebSec contact address on the Radware block page 그리고 Radware block-page message |
| Bot Manager cookies with its first-party script | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) 그리고 First-party Radware Bot Manager script (stormcaster.js) |
| Bot Manager cookies, script and connector object | 100% | Radware Bot Manager session cookies (__uzma … __uzmf) 그리고 First-party Radware Bot Manager script (stormcaster.js) 그리고 Radware Bot Manager JavaScript connector object |
| Bot Manager captcha host with its session cookies | 100% | Radware Bot Manager captcha / validation host 그리고 Radware Bot Manager session cookies (__uzma … __uzmf) |
| Radware edge server with Bot Manager cookies | 85% | Server: rdwr sent by the Radware edge 그리고 (Radware Bot Manager session cookies (__uzma … __uzmf) 또는 Radware Bot Manager cookies written by its JavaScript) |

## 난이도

**낮음.** 낮음은 확장 프로그램이 이 보호 기술을 가벼운 장애물로 평가한다는 뜻입니다. 대개 단순한 클라이언트만 걸러 내며, 실제 브라우저나 브라우저와 비슷하게 잘 구성한 요청은 통과하는 경우가 많습니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

Radware Bot Manager이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

Radware Bot Manager이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 Radware Bot Manager이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
