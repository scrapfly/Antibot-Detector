# CAPTCHA and anti-bot evidence weights

Reviewed 2026-10-05 for the 9 CAPTCHA and 16 anti-bot definitions. As in
[FINGERPRINT-CONFIDENCE.md](FINGERPRINT-CONFIDENCE.md), confidence is strength of
evidence, set by engineering judgment from live observations. It is not a measured
probability.

## How a score is formed

- Each rule has an `id`, a confidence and an optional `standalone: false`.
- A detector scores the maximum of its standalone matches and its satisfied
  `combinations`. Matches never add up.
- `standalone: false` marks signals that are common on unprotected pages (a CDN
  `server` header, a short cookie name, a generic path, a word in a script). They
  count only inside a combination.
- Combinations need at least two independent observations. Two rules matching the
  same cookie, header or URL do not count as two; every rule pair that could is kept
  mutually exclusive and tested.

## Tiers

| Score | Meaning |
| --- | --- |
| 5–30 | Script text or a weak network hint. Library code, comments and feature checks also match. |
| 40–60 | One vendor-specific observation: a vendor host, a documented cookie shape, a block header. |
| 65–90 | One strong signal (a vendor-only cookie or header, an SDK object) or a pair of moderate ones. |
| 95 | Two independent vendor signals, for example a sensor script plus its session cookie, or a challenge header plus its bootstrap object. |

No single rule is above 90, so a 95 always means at least two observations agreed.
Some detectors stop lower because their strongest evidence is weaker (AliExpress at
60, the legacy Ocule and Meetrics at 60, Friendly Captcha and FunCaptcha at 90).

## Anti-bot (v2.0.0)

Rules were rebuilt from live pages and responses captured on 2026-10-04/05
(walmart, nike, zillow, target, etsy, leboncoin, hyatt, costco, realestate.com.au,
ups, citi, elal, youtube and others), plus vendor block pages.

| Detector | Rules | Best single rule | Combination-only rules | Strongest combination |
| --- | --- | --- | --- | --- |
| Akamai Bot Manager | 18 | 85 | 5 | 95: Sensor script or object with a Bot Manager cookie |
| AWS WAF | 11 | 90 | 4 | 95: Challenge response with its bootstrap |
| Google BotGuard | 5 | 80 | 2 | 95: Interpreter loaded and attestation sent |
| Cheq | 11 | 80 | 3 | 95: CHEQ tag with its runtime or cookies |
| Cloudflare Bot Management | 9 | 90 | 2 | 95: Challenge page orchestrator and challenge options object |
| DataDome | 11 | 90 | 3 | 95: DataDome tag with its session cookie |
| F5 BIG-IP ASM | 5 | 55 | 4 | 95: ASM block page |
| Incapsula (Imperva) | 10 | 85 | 1 | 95: Incapsula session and visitor cookies |
| Kasada | 8 | 80 | 2 | 95: Client script with KPSDK running |
| Meetrics Check | 4 | 40 | 1 | 60: Legacy tag with its runtime |
| Ocule | 3 | 40 | 1 | 60: Legacy loader with other Ocule traffic |
| PerimeterX | 12 | 85 | 3 | 95: PerimeterX script or app ID with its cookies |
| Reblaze | 7 | 80 | 2 | 95: Challenge library with its namespace |
| Shape Security | 5 | 85 | 2 | 95: Seeded loader with its runtime |
| Sucuri WAF | 8 | 90 | 3 | 95: Sucuri block page with its headers |
| ThreatMetrix | 6 | 85 | 1 | 95: Profiling tag with its runtime |

Notable corrections against v1:

- URL rules are anchored regexes. The old substring rules (`/challenge.js`,
  `/verify`, `/telemetry`, `ips.js`, `org_id=`, `ocule`, `cheq`) matched ordinary
  sites at 85–100.
- Kasada matches only `ips.js`/`p.js` and its endpoints on the double-UUID path.
  DataGrail's `consent.js` uses the same path shape (seen on zillow).
- Shape no longer treats any `x-<8 chars>-<letter>` header as its own: that rule
  matched `x-datadome-cid` and others. The seeded `ssx.mod.js` loader and
  `__xr_bmobdb` replace it.
- F5 requires the `TS01xxxxxx=01…` cookie shape; `TSession`-style names and a lone
  `BIGipServer` load-balancer cookie no longer count.
- AWS WAF uses the regional `token.awswaf.com` host, `x-amzn-waf-action` and
  `gokuProps`/`AwsWafIntegration`.
- CHEQ's tag is served from a disguised random host, so it is found by its
  `ct_clicktrue_*` class and `data-jsonp="onCheqResponse"` attribute.
- BotGuard (previously empty) detects the `//www.google.com/js/th/` interpreter and
  the Web Anti-Abuse `Waa/Create` RPC. The word "botguard" alone is not used: the
  reCAPTCHA runtime contains it.
- Ocule and Meetrics are kept as legacy detectors capped at 60. Ocule joined
  hCaptcha and its loader host no longer resolves; Meetrics' `mxcdn.net` is parked.

## CAPTCHA

| Detector | Rules | Best single rule | Combination-only rules | Strongest combination |
| --- | --- | --- | --- | --- |
| AliExpress CAPTCHA | 5 | 40 | 1 | 60: AliExpress x5secdata and first-step routing with punish-page resource |
| Captcha.eu | 7 | 50 | 0 | 95: SDK resource, form markup and compatible runtime API |
| Friendly Captcha | 11 | 60 | 0 | 90: Heuristic v1 integration: widget attributes, resource and constructor presence |
| FunCaptcha (Arkose Labs) | 7 | 60 | 0 | 90: Official client API, enforcement frame and session token request |
| GeeTest | 10 | 60 | 0 | 95: v3 library, widget and initializer present |
| hCaptcha | 8 | 60 | 0 | 95: Official API resource, marked widget, frame and compatible runtime API presence |
| QCloud Captcha | 6 | 60 | 0 | 95: SDK, challenge frame markup and constructor corroborate integration |
| Google reCAPTCHA | 13 | 60 | 4 | 95: Official SDK, configured widget, Google frame and compatible API |
| Cloudflare Turnstile | 7 | 60 | 0 | 95: Official API resource, widget frame and response field |

Script references are capped at 10 and frames, widgets and SDK URLs are matched by
exact host and path, so lookalike hosts (`vendor.com.evil.test`, `evil.test/?next=`)
never identify a CAPTCHA.

## Verify

`npm run verify` runs `test/antibot-confidence.test.js` and
`test/captcha-confidence.test.js`. Every rule is driven through the production
matcher by a live-shaped witness (`test/fixtures/*-confidence.json`); every
combination branch must reach its tier and must drop when any one signal is
removed; every regex passes the ReDoS guard; benign lookalikes from real pages and
other vendors' full signal sets must score 0 (anti-bot) or stay low.

Existing installations keep their stored rules until Rules → Update or a reset
loads the new definitions.
