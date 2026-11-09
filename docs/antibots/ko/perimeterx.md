[English](../perimeterx.md) | [Español](../es/perimeterx.md) | [Русский](../ru/perimeterx.md) | [简体中文](../zh-CN/perimeterx.md) | [日本語](../ja/perimeterx.md) | [Português (Brasil)](../pt-BR/perimeterx.md) | [Deutsch](../de/perimeterx.md) | [Français](../fr/perimeterx.md) | **한국어**

# HUMAN (PerimeterX) 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

HUMAN (PerimeterX)은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. HUMAN (PerimeterX) 우회 방법을 찾고 있거나, 사이트에서 HUMAN (PerimeterX)을(를) 감지하려 하거나, HUMAN (PerimeterX)이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 HUMAN (PerimeterX)인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 HUMAN (PerimeterX) 봇 탐지를 식별하는 데 쓰는 공개 신호 12개와 각 신호가 얼마나 강하게 HUMAN (PerimeterX)을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

PerimeterX는 현재 HUMAN Security에 속해 있습니다. 봇 디펜더가 페이지에 스크립트를 배치하고 행동 및 기기 신호로 방문자에게 점수를 매기며, 길게 누르기(press-and-hold) 방식의 챌린지로 응답할 수 있습니다.

공식 사이트: [https://www.humansecurity.com/](https://www.humansecurity.com/)

## 사이트가 HUMAN (PerimeterX)을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-perimeterx`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.3.1, 최종 업데이트 2026-10-30)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 쿠키

페이지에서 설정된 쿠키 이름(값이 일치 대상인 경우 값 포함)입니다. 일반 단어가 아닌 한 패턴은 정규식입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^_px[23]$ = ^[0-9a-f]{64}:[A-Za-z0-9+/=_-]{20,}` | 100% | PerimeterX risk token cookie (_px2 or _px3) |
| `^_pxhd$ = ^[A-Za-z0-9+/=_-]{60,120}(?::\|$)` | 100% | PerimeterX first-party server cookie |
| `^_pxvid$ = ^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 100% | PerimeterX visitor ID cookie |
| `^(?:pxcts\|_pxde\|_pxff_[A-Za-z0-9_]+)$` | 50% (보조 근거로만 사용) | Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |

### 스크립트 및 요청 URL

페이지가 불러오는 스크립트, 프레임, 요청의 주소입니다. 전체 주소를 대상으로 매칭하는 패턴입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^https://client\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/PX[A-Za-z0-9]{6,10}/main\.min\.js(?:[?#]\|$)` | 100% | PerimeterX client script on its own hosts, keyed by the PX app ID |
| `^https?://[^/?#]+/(?:[a-z0-9]{1,12}/)?PX[A-Za-z0-9]{6,10}/(?:init\|main\.min)\.js(?:[?#]\|$)` | 75% | First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) |
| `^https://collector-(?:PX[A-Za-z0-9]{6,10}\|[a-z])\.(?:px-cloud\.net\|perimeterx\.net\|hsprotect\.net)/` | 100% | PerimeterX collector endpoint |
| `^https://captcha\.px-cdn\.net/PX[A-Za-z0-9]{6,10}/` | 100% | PerimeterX challenge (Press & Hold) script host |
| `^https?://[^/?#]+/[A-Za-z0-9]{8}/captcha/captcha\.js(?:[?#]\|$)` | 30% (보조 근거로만 사용) | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) |

### 페이지 및 스크립트 콘텐츠

페이지 또는 페이지의 스크립트 안에서 발견되는 텍스트입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `_pxAppId` | 25% | Script assigning the PerimeterX app ID (window._pxAppId) |

### JavaScript 전역 변수(window)

페이지 자체의 JavaScript 컨텍스트가 `window`에 노출하는 속성입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `_pxAppId (typeof string)` | 70% | PerimeterX application ID |
| `pxInit (typeof function)` | 30% (보조 근거로만 사용) | Optional PerimeterX init callback defined by the site |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| PerimeterX script or app ID with its cookies | 100% | (PerimeterX client script on its own hosts, keyed by the PX app ID 또는 First-party PerimeterX script (/PXxxxx/init.js or under a proxy prefix such as /px/PXxxxx/init.js) 또는 PerimeterX application ID 또는 PerimeterX collector endpoint) 그리고 (PerimeterX risk token cookie (_px2 or _px3) 또는 PerimeterX first-party server cookie 또는 PerimeterX visitor ID cookie) |
| Several PerimeterX cookies together | 100% | 다음 중 2개 이상: PerimeterX risk token cookie (_px2 or _px3); PerimeterX first-party server cookie; PerimeterX visitor ID cookie; Auxiliary PerimeterX cookies (pxcts, _pxde, _pxff_*) |
| PerimeterX challenge with the app ID | 100% | PerimeterX challenge (Press & Hold) script host 그리고 (PerimeterX application ID 또는 Script assigning the PerimeterX app ID (window._pxAppId) 또는 Optional PerimeterX init callback defined by the site) |
| First-party PerimeterX challenge with the app ID | 95% | First-party PerimeterX captcha script on an app-id path without the PX prefix (/HYx10rg3/captcha/captcha.js) 그리고 (PerimeterX application ID 또는 Script assigning the PerimeterX app ID (window._pxAppId) 또는 Optional PerimeterX init callback defined by the site) |

## 난이도

**높음.** 높음은 확장 프로그램이 이 보호 기술을 통과하기 가장 어려운 부류로 평가한다는 뜻입니다. 대체로 클라이언트 측 검사에 행동 기반 또는 서버 측 점수 산정을 결합합니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

HUMAN (PerimeterX)이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

HUMAN (PerimeterX)이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 HUMAN (PerimeterX)이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
