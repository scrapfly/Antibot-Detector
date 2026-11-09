[English](../anubis.md) | [Español](../es/anubis.md) | [Русский](../ru/anubis.md) | [简体中文](../zh-CN/anubis.md) | [日本語](../ja/anubis.md) | [Português (Brasil)](../pt-BR/anubis.md) | [Deutsch](../de/anubis.md) | [Français](../fr/anubis.md) | **한국어**

# Anubis 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

Anubis은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. Anubis 우회 방법을 찾고 있거나, 사이트에서 Anubis을(를) 감지하려 하거나, Anubis이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 Anubis인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 Anubis 봇 탐지를 식별하는 데 쓰는 공개 신호 6개와 각 신호가 얼마나 강하게 Anubis을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

Anubis는 Techaro의 오픈 소스 웹 게이트로, 페이지가 로드되기 전에 새 방문자의 브라우저가 작은 작업 증명(proof-of-work) 퍼즐을 풀도록 요구합니다. AI 크롤러를 늦추기 위해 만들어졌으며 많은 오픈 소스 및 커뮤니티 사이트에서 사용합니다.

공식 사이트: [https://anubis.techaro.nl/](https://anubis.techaro.nl/)

## 사이트가 Anubis을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-anubis`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.1.1, 최종 업데이트 2026-10-30)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 쿠키

페이지에서 설정된 쿠키 이름(값이 일치 대상인 경우 값 포함)입니다. 일반 단어가 아닌 한 패턴은 정규식입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^(?:[\w.-]+-)?anubis-auth(?:-[0-9a-f]{6,16})?$ = ^eyJ[\w-]+\.eyJ` | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) |
| `^(?:[\w.-]+-)?anubis-cookie-verification(?:-[0-9a-f]{6,16})?$ = ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | 100% | Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix) |

### 스크립트 및 요청 URL

페이지가 불러오는 스크립트, 프레임, 요청의 주소입니다. 전체 주소를 대상으로 매칭하는 패턴입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^https?://[^/?#]+/\.within\.website/x/(?:cmd/)?anubis/` | 100% | Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

### DOM 요소

CSS 선택자로 매칭되는 요소입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `script[src*=".within.website/x/cmd/anubis/"]` | 55% | Anubis main challenge module loaded from the command endpoint |
| `img[src*=".within.website/x/cmd/anubis/"]` | 45% | Anubis mascot image (pensive/happy/reject) loaded from the command endpoint |
| `.bar-inner` | 30% (보조 근거로만 사용) | Proof-of-work progress bar inner element on the challenge page |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| Challenge page script and mascot image | 75% | Anubis main challenge module loaded from the command endpoint 그리고 (Anubis mascot image (pensive/happy/reject) loaded from the command endpoint 또는 Proof-of-work progress bar inner element on the challenge page) |
| Auth cookie with a command endpoint request | 90% | (Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) 또는 Anubis cookie-verification cookie set with the challenge (some deployments add a hash suffix)) 그리고 Anubis command endpoint serving challenge scripts, images and the pass-challenge API |
| Auth cookie, challenge script and command endpoint | 100% | Signed JWT cookie issued after a passed proof-of-work challenge (bare or policy-prefixed name) 그리고 Anubis main challenge module loaded from the command endpoint 그리고 Anubis command endpoint serving challenge scripts, images and the pass-challenge API |

## 난이도

**낮음.** 낮음은 확장 프로그램이 이 보호 기술을 가벼운 장애물로 평가한다는 뜻입니다. 대개 단순한 클라이언트만 걸러 내며, 실제 브라우저나 브라우저와 비슷하게 잘 구성한 요청은 통과하는 경우가 많습니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

Anubis이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

Anubis이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 Anubis이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
