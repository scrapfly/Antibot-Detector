[English](../azure-waf.md) | [Español](../es/azure-waf.md) | [Русский](../ru/azure-waf.md) | [简体中文](../zh-CN/azure-waf.md) | [日本語](../ja/azure-waf.md) | [Português (Brasil)](../pt-BR/azure-waf.md) | [Deutsch](../de/azure-waf.md) | [Français](../fr/azure-waf.md) | **한국어**

# Azure WAF 봇 차단: 감지 방법과 웹 스크래핑에 미치는 영향

Azure WAF은(는) 일부 웹사이트가 페이지 앞단에 두는 봇 차단 또는 어뷰징 방지 계층입니다. Azure WAF 우회 방법을 찾고 있거나, 사이트에서 Azure WAF을(를) 감지하려 하거나, Azure WAF이(가) 막는 웹 스크래핑을 조사하는 경우에도 첫 단계는 같습니다. 요청에 실제로 응답하는 것이 Azure WAF인지 확인하는 것입니다. 이 페이지는 Scrapfly Antibot Detector 확장 프로그램이 Azure WAF 봇 탐지를 식별하는 데 쓰는 공개 신호 3개와 각 신호가 얼마나 강하게 Azure WAF을(를) 가리키는지, 그리고 자동화 클라이언트에 대체로 어떤 의미인지를 정리합니다.

## 개요

Azure Web Application Firewall은 Azure Front Door와 Application Gateway용 Microsoft WAF입니다. 공격 차단 외에도 봇 규칙이 의심스러운 클라이언트에 JavaScript 챌린지로, Front Door에서는 CAPTCHA로 응답할 수 있습니다.

공식 사이트: [https://learn.microsoft.com/azure/web-application-firewall/](https://learn.microsoft.com/azure/web-application-firewall/)

## 사이트가 Azure WAF을(를) 사용하는지 확인하는 방법

이 신호들은 `detect-azure-waf`에 대한 확장 프로그램의 자체 탐지 규칙(규칙 버전 2.0.0, 최종 업데이트 2026-11-12)에서 생성되었습니다. 신호는 어디까지나 정황일 뿐이며, 신뢰도는 해당 신호 하나가 관찰되었을 때 확장 프로그램이 얼마나 확신하는지를 나타냅니다. "보조 근거로만 사용"으로 표시된 신호는 다른 제품도 만들어 낼 수 있으므로 단독으로는 집계되지 않습니다.

### 쿠키

페이지에서 설정된 쿠키 이름(값이 일치 대상인 경우 값 포함)입니다. 일반 단어가 아닌 한 패턴은 정규식입니다.

| 신호 | 신뢰도 | 의미 |
| --- | --- | --- |
| `^afd_azwaf_jsclearance$` | 90% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^appgw_azwaf_jsclearance$` | 90% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| `^afd_azwaf_captcha$` | 90% | afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

### 조합

일부 신호는 함께 나타날 때 단독일 때보다 점수가 높습니다. 확장 프로그램은 이러한 조합도 함께 보고합니다.

| 조합 | 신뢰도 | 필요 조건 |
| --- | --- | --- |
| Front Door JavaScript challenge and CAPTCHA cookies | 100% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) 그리고 afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |
| JavaScript challenge cookies of Front Door and Application Gateway | 95% | afd_azwaf_jsclearance cookie Azure WAF on Front Door sets after its JavaScript challenge is passed (Microsoft Learn) 그리고 appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) |
| Application Gateway JavaScript challenge cookie with the Front Door CAPTCHA cookie | 95% | appgw_azwaf_jsclearance cookie Azure WAF on Application Gateway sets after its JavaScript challenge is passed (Microsoft Learn) 그리고 afd_azwaf_captcha cookie Azure WAF on Front Door sets after its CAPTCHA is solved (Microsoft Learn) |

## 난이도

**보통.** 보통은 확장 프로그램이 이 보호 기술을 실질적인 장애물로 평가한다는 뜻입니다. 브라우저, 요청 세부 정보 또는 둘 다에 대한 검사가 있을 것으로 예상되며, 이 검사는 시간이 지나면서 바뀔 수 있습니다.

이 등급은 확장 프로그램 자체의 경험칙이며 공급업체의 공식 입장이 아닙니다. 사이트의 설정에 따라 같은 제품이라도 더 쉽거나 더 어려울 수 있습니다.

## 웹 스크래핑에 미치는 영향

Azure WAF이(가) 있으면 실제 브라우저 세션처럼 일관되게 보이지 않는 요청은 챌린지를 받거나, 지연되거나, 거부될 수 있으며, 원하던 콘텐츠 대신 챌린지 또는 차단 페이지가 응답으로 올 수 있습니다. 정확히 어떤 일이 일어나는지는 사이트 운영자가 제품을 어떻게 설정했는지에 달려 있으며, 이는 사이트마다 다를 수 있고 예고 없이 바뀔 수도 있습니다. 탐지 결과는 실제로 받는 응답을 확인해 보라는 신호로 받아들이고, 차단이 보장된다는 뜻으로 받아들이지 마세요.

Azure WAF이(가) 보호하는 페이지를 우회 방법을 직접 유지하지 않고 스크래핑하려면 Scrapfly의 [Anti Scraping Protection 문서](https://scrapfly.io/docs/scrape-api/anti-scraping-protection)와(과) [Scrape API](https://scrapfly.io/docs/scrape-api/getting-started)를 참고하세요. 허용된 범위 안에서만 스크래핑하고, 사이트의 이용 약관과 robots 규칙을 존중하세요.

## 확장 프로그램으로 감지하기

Chrome용 무료 [Scrapfly Anti-bot Detector](https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca)을(를) 설치하고 해당 페이지에 접속하면, 팝업에 Azure WAF이(가) 신뢰도, 난이도, 일치한 정확한 신호와 함께 표시됩니다. 자세한 내용은 [프로젝트 README](../../README.ko.md)에서 확인하거나 [확장 프로그램이 감지하는 모든 안티봇 보호 기술](README.md)을(를) 참고하세요.
