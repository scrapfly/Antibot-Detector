/**
 * CAPTCHA vendors whose Advanced tools are data: one entry per detector,
 * read by the popup (GenericCaptchaAdvanced, Extract Site Key probe) and by
 * the service worker (Analyze Scripts classifier).
 *
 * scripts: Analyze Scripts rules, first match wins. A rule matches a URL by
 *   exact `hosts` or by `domains` (the domain or any subdomain), and by an
 *   optional `path` regex on the pathname; `type` is the chip shown.
 * siteKey: Extract Site Key. `key` validates every value found; `label` is the
 *   vendor's own name for it; `rules` say where to look (see sitekey-probe.js):
 *   attr (an element attribute), url (a script, frame or request URL, then a
 *   query param or a capture group), inline (a capture group in an inline
 *   script, after a cheap `hint` check), global (MAIN world, only when nothing
 *   else found a key) and fact (a page fact such as the widget version).
 * Regexes have bounded quantifiers and no g/y flags; selectors are compound
 * (no combinators), so the tests can check them without a browser.
 */
(function (global) {
    const list = [
        {
            vendorId: 'prosopo', detectorId: 'prosopo', className: 'ProsopoAdvanced',
            productName: 'Prosopo Procaptcha', logo: 'prosopo_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['js.prosopo.io'], path: /^\/js\//, type: 'bundle' },
                // pronode*.prosopo.io; no catch-all, prosopo.io is also the vendor's own website
                { domains: ['prosopo.io'], path: /^\/v1\/prosopo\/provider\//, type: 'provider' }
            ],
            siteKey: {
                label: 'siteKey',
                key: /^5[1-9A-HJ-NP-Za-km-z]{46,47}$/,
                rules: [
                    { type: 'attr', selector: '.procaptcha[data-sitekey]', attr: 'data-sitekey', source: 'widget',
                        fields: { captchaType: 'data-captcha-type', theme: 'data-theme', language: 'data-language' } },
                    { type: 'inline', hint: 'rocaptcha', pattern: /site[Kk]ey["']?\s*:\s*["'](5[1-9A-HJ-NP-Za-km-z]{46,47})["']/ }
                ]
            }
        },
        {
            vendorId: 'friendlycaptcha', detectorId: 'friendlycaptcha', className: 'FriendlyCaptchaAdvanced',
            productName: 'Friendly Captcha', logo: 'friendlycaptcha_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['cdn.jsdelivr.net', 'unpkg.com'], path: /^\/(?:npm\/)?friendly-challenge(?:@[^/]{1,40})?\//, type: 'widget v1' },
                { hosts: ['cdn.jsdelivr.net', 'unpkg.com'], path: /^\/(?:npm\/)?@friendlycaptcha\/sdk(?:@[^/]{1,40})?\//, type: 'sdk v2' },
                { hosts: ['api.friendlycaptcha.com', 'eu-api.friendlycaptcha.eu'], path: /^\/api\/v1\//, type: 'api v1' },
                { domains: ['frcapi.com'], path: /^\/api\/v2\//, type: 'api v2' }
            ],
            siteKey: {
                label: 'sitekey',
                key: /^[A-Za-z0-9_-]{8,64}$/,
                rules: [
                    { type: 'attr', selector: '.frc-captcha[data-sitekey]', attr: 'data-sitekey', source: 'widget',
                        fields: { start: 'data-start', lang: 'data-lang', puzzleEndpoint: 'data-puzzle-endpoint', apiEndpoint: 'data-api-endpoint' } },
                    { type: 'url', url: /^https:\/\/(?:api\.friendlycaptcha\.com|eu-api\.friendlycaptcha\.eu)\/api\/v1\/puzzle/, param: 'sitekey' },
                    // v2 widgets made with createWidget() carry the key only in their frame URL
                    { type: 'url', url: /^https:\/\/(?:[a-z0-9-]+\.)?frcapi\.com\/api\/v2\/captcha\/widget/, param: 'sitekey' },
                    { type: 'inline', hint: 'riendly', pattern: /sitekey["']?\s*:\s*["']([A-Za-z0-9_-]{8,64})["']/ },
                    { type: 'fact', name: 'version', value: 'v1', selector: 'input[name="frc-captcha-solution"]' },
                    { type: 'fact', name: 'version', value: 'v2', selector: 'input[name="frc-captcha-response"]' },
                    { type: 'fact', name: 'version', value: 'v1', url: /\/friendly-challenge(?:@[^/]{1,40})?\/|friendlycaptcha\.(?:com|eu)\/api\/v1\// },
                    { type: 'fact', name: 'version', value: 'v2', url: /\/@friendlycaptcha\/sdk|frcapi\.com\/api\/v2\// }
                ]
            }
        },
        {
            vendorId: 'mtcaptcha', detectorId: 'mtcaptcha', className: 'MtCaptchaAdvanced',
            productName: 'MTCaptcha', logo: 'mtcaptcha_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['service.mtcaptcha.com', 'service2.mtcaptcha.com'], path: /^\/mtcv1\/client\//, type: 'client' },
                { hosts: ['service.mtcaptcha.com', 'service2.mtcaptcha.com'], path: /^\/mtcv1\/api\//, type: 'api' },
                { hosts: ['service.mtcaptcha.com', 'service2.mtcaptcha.com'], type: 'mtcaptcha' }
            ],
            siteKey: {
                label: 'sitekey',
                key: /^MTPublic-[A-Za-z0-9]{6,40}$/,
                rules: [
                    { type: 'inline', hint: 'MTPublic-', pattern: /(MTPublic-[A-Za-z0-9]{6,40})/ },
                    { type: 'attr', selector: '.mtcaptcha[data-sitekey]', attr: 'data-sitekey', source: 'widget' },
                    { type: 'url', url: /^https:\/\/service2?\.mtcaptcha\.com\/mtcv1\/(?:client\/iframe\.html|api\/getchallenge\.json)/, param: 'sitekey' },
                    { type: 'url', url: /^https:\/\/service2?\.mtcaptcha\.com\/mtcv1\/api\/getchallenge\.json/, param: 'sk' },
                    { type: 'global', path: 'mtcaptchaConfig.sitekey' }
                ]
            }
        },
        {
            vendorId: 'smartcaptcha', detectorId: 'smartcaptcha', className: 'SmartCaptchaAdvanced',
            productName: 'Yandex SmartCaptcha', logo: 'smartcaptcha_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['smartcaptcha.yandexcloud.net', 'smartcaptcha.cloud.yandex.ru'], path: /^\/captcha\.js$/, type: 'sdk' },
                { hosts: ['smartcaptcha.yandexcloud.net', 'smartcaptcha.cloud.yandex.ru'], path: /^\/check\/?$/, type: 'check' },
                { hosts: ['smartcaptcha.yandexcloud.net', 'smartcaptcha.cloud.yandex.ru'], type: 'frame' }
            ],
            siteKey: {
                label: 'sitekey',
                // ysc1_ keys, and the older 40-character keys (the vendor's own demo uses one)
                key: /^(?:ysc1_)?[A-Za-z0-9]{20,80}$/,
                rules: [
                    { type: 'attr', selector: '.smart-captcha[data-sitekey]', attr: 'data-sitekey', source: 'widget',
                        fields: { hl: 'data-hl', invisible: 'data-invisible', test: 'data-test' } },
                    { type: 'url', url: /^https:\/\/smartcaptcha\.(?:yandexcloud\.net|cloud\.yandex\.ru)\//, param: 'sitekey' },
                    { type: 'inline', hint: 'ysc1_', pattern: /(ysc1_[A-Za-z0-9]{20,80})/ }
                ]
            }
        },
        {
            vendorId: 'captchaeu', detectorId: 'captchaeu', className: 'CaptchaEuAdvanced',
            productName: 'Captcha.eu', logo: 'captchaeu_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            // www.captcha.eu is also the vendor's own website, so no catch-all rule here
            scripts: [
                { hosts: ['www.captcha.eu', 'captcha.eu'], path: /^\/sdk\.js$/, type: 'sdk' },
                { hosts: ['www.captcha.eu', 'captcha.eu'], path: /^\/(?:challenge|validate)(?:\/|$)/, type: 'challenge' },
                { hosts: ['www.captcha.eu', 'captcha.eu'], path: /^\/api\/widget\//, type: 'widget' },
                { hosts: ['b.captcha.eu'], path: /^\/bm$/, type: 'bot check' }
            ],
            siteKey: {
                label: 'publicSecret',
                key: /^[A-Za-z0-9_.:-]{8,128}$/,
                rules: [
                    { type: 'inline', hint: 'KROT', pattern: /KROT\.setup\(\s*["']([A-Za-z0-9_.:-]{8,128})["']/ },
                    // The SDK sends the key with every challenge and bot check
                    { type: 'url', url: /^https:\/\/(?:www\.captcha\.eu\/challenge|b\.captcha\.eu\/bm)(?:[/?]|$)/, param: 'publicSecret' },
                    { type: 'global', path: 'KROT.publicSecret' }
                ]
            }
        },
        {
            vendorId: 'qcloud', detectorId: 'qcloud', className: 'QCloudCaptchaAdvanced',
            productName: 'QCloud Captcha', logo: 'qcloud_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['turing.captcha.qcloud.com', 'ca.turing.captcha.qcloud.com', 'ssl.captcha.qq.com', 't.captcha.qq.com', 'www.tycaptcha.com'], path: /^\/T[A-Za-z]{0,4}Captcha(?:-global)?\.js$/, type: 'sdk' },
                { hosts: ['turing.captcha.qcloud.com', 'ca.turing.captcha.qcloud.com', 'ssl.captcha.qq.com', 't.captcha.qq.com'], path: /^\/cap_union_/, type: 'api' },
                { hosts: ['turing.captcha.qcloud.com', 'ca.turing.captcha.qcloud.com'], path: /^\/template\//, type: 'frame' },
                { domains: ['turing.captcha.qcloud.com', 'captcha.qq.com', 'tycaptcha.com'], type: 'tencent' }
            ],
            siteKey: {
                label: 'CaptchaAppId',
                key: /^\d{6,12}$/,
                rules: [
                    { type: 'url', url: /^https:\/\/(?:ca\.)?turing\.captcha\.qcloud\.com\/cap_union_|^https:\/\/(?:ssl|t)\.captcha\.qq\.com\/cap_union_/, param: 'aid' },
                    { type: 'attr', selector: '#TencentCaptcha[data-appid]', attr: 'data-appid', source: 'widget', fields: { callback: 'data-cbfn', bizState: 'data-biz-state' } },
                    { type: 'inline', hint: 'TencentCaptcha', pattern: /new\s+TencentCaptcha\(\s*(?:[^,()]{1,200},\s*)?["']?(\d{6,12})/ }
                ]
            }
        },
        {
            vendorId: 'yidun', detectorId: 'yidun', className: 'YidunCaptchaAdvanced',
            productName: 'NetEase Yidun', logo: 'yidun_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['cstaticdun.126.net'], path: /^\/load\.min\.js$/, type: 'loader' },
                { hosts: ['cstaticdun.126.net'], type: 'core' },
                { hosts: ['c.dun.163.com', 'c-v6.dun.163.com', 'c.dun.163yun.com'], path: /^\/api\//, type: 'api' }
            ],
            siteKey: {
                label: 'captchaId',
                key: /^[0-9a-fA-F]{32}$/,
                rules: [
                    { type: 'url', url: /^https:\/\/c(?:-v6)?\.dun\.163(?:yun)?\.com\/api\/v[23]\/get/, param: 'id' },
                    { type: 'inline', hint: 'initNECaptcha', pattern: /captchaId["']?\s*:\s*["']([0-9a-fA-F]{32})["']/ },
                    { type: 'fact', name: 'mode', pattern: /initNECaptcha[\s\S]{0,600}?mode["']?\s*:\s*["'](popup|float|embed|bind)["']/ }
                ]
            }
        },
        {
            vendorId: 'aliyun', detectorId: 'aliyun', className: 'AliyunCaptchaAdvanced',
            productName: 'Aliyun Captcha 2.0', logo: 'aliyun_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['o.alicdn.com', 'g.alicdn.com'], path: /^\/captcha-frontend\//, type: 'sdk' },
                { domains: ['alicdn.com'], path: /^\/sd\/ncpc\//, type: 'nc' },
                { domains: ['captcha-open.aliyuncs.com'], type: 'api' }
            ],
            siteKey: {
                label: 'SceneId',
                key: /^[A-Za-z0-9]{4,32}$/,
                rules: [
                    { type: 'inline', hint: 'SceneId', pattern: /SceneId["']?\s*:\s*["']([A-Za-z0-9]{4,32})["']/ },
                    { type: 'fact', name: 'prefix', pattern: /prefix["']?\s*:\s*["']([A-Za-z0-9]{4,16})["']/ },
                    { type: 'fact', name: 'region', pattern: /region["']?\s*:\s*["'](cn|sgp)["']/ },
                    { type: 'fact', name: 'mode', pattern: /initAliyunCaptcha[\s\S]{0,600}?mode["']?\s*:\s*["'](popup|embed)["']/ }
                ]
            }
        },
        {
            vendorId: 'dingxiang', detectorId: 'dingxiang', className: 'DingxiangCaptchaAdvanced',
            productName: 'Dingxiang Captcha', logo: 'dingxiang_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['cdn.dingxiang-inc.com'], path: /^\/(?:ctu-group\/)?captcha-ui\//, type: 'sdk' },
                { hosts: ['cdn.dingxiang-inc.com'], path: /^\/ctu-group\/captcha-js\//, type: 'engine' },
                { hosts: ['cap.dingxiang-inc.com'], path: /^\/api\//, type: 'api' }
            ],
            siteKey: {
                label: 'appId',
                key: /^[0-9a-fA-F]{32}$/,
                rules: [
                    { type: 'inline', hint: 'appId', pattern: /appId["']?\s*:\s*["']([0-9a-fA-F]{32})["']/ },
                    { type: 'url', url: /^https:\/\/cap\.dingxiang-inc\.com\/api\//, param: 'ak' },
                    { type: 'fact', name: 'style', pattern: /_dx\.Captcha[\s\S]{0,600}?style["']?\s*:\s*["'](popup|embed|inline|oneclick)["']/ }
                ]
            }
        },
        {
            vendorId: 'shumei', detectorId: 'shumei', className: 'ShumeiCaptchaAdvanced',
            productName: 'Shumei Captcha', logo: 'shumei_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { hosts: ['captcha.fengkongcloud.cn', 'captcha1.fengkongcloud.cn', 'captcha.fengkongcloud.com', 'captcha1.fengkongcloud.com'], path: /^\/ca\/v[12]\//, type: 'api' },
                { hosts: ['castatic.fengkongcloud.cn', 'castatic.fengkongcloud.com'], type: 'sdk' }
            ],
            siteKey: {
                label: 'organization',
                key: /^[A-Za-z0-9]{10,40}$/,
                rules: [
                    { type: 'url', url: /^https:\/\/captcha1?\.fengkongcloud\.(?:cn|com)\/ca\/v[12]\/(?:conf|register)/, param: 'organization' },
                    { type: 'inline', hint: 'initSMCaptcha', pattern: /organization["']?\s*:\s*["']([A-Za-z0-9]{10,40})["']/ },
                    { type: 'fact', name: 'appId', url: /^https:\/\/captcha1?\.fengkongcloud\.(?:cn|com)\/ca\/v[12]\/(?:conf|register)/, param: 'appId' },
                    { type: 'fact', name: 'product', pattern: /initSMCaptcha[\s\S]{0,600}?product["']?\s*:\s*["'](popup|embed|float)["']/ }
                ]
            }
        },
        {
            vendorId: 'capy', detectorId: 'capy', className: 'CapyCaptchaAdvanced',
            productName: 'Capy Puzzle Captcha', logo: 'capy_official.png', infoKey: 'advancedInfoCaptchaKeyDesc',
            scripts: [
                { domains: ['capy.me'], path: /^\/puzzle\/get_js\//, type: 'sdk' },
                { domains: ['capy.me'], path: /^\/puzzle\//, type: 'puzzle' },
                { hosts: ['api.capy.me', 'jp.api.capy.me'], type: 'capy' }
            ],
            siteKey: {
                label: 'captchakey',
                key: /^PUZZLE_[A-Za-z0-9]{20,60}$/,
                rules: [
                    { type: 'url', url: /^https:\/\/(?:jp\.api|www|api)\.capy\.me\/puzzle\/get_js\//, param: 'k' },
                    { type: 'attr', selector: 'input[name="capy_captchakey"]', attr: 'value', source: 'widget' },
                    { type: 'inline', hint: 'PUZZLE_', pattern: /(PUZZLE_[A-Za-z0-9]{20,60})/ }
                ]
            }
        },
        {
            vendorId: 'binance', detectorId: 'binance-captcha', className: 'BinanceCaptchaAdvanced',
            productName: 'Binance Captcha', logo: 'binance_official.png', infoKey: 'advancedInfoCaptchaScriptsDesc',
            scripts: [
                { domains: ['binance.com', 'bnbstatic.com'], path: /^\/static\/js\/se\/captcha\//, type: 'sdk' },
                { domains: ['binance.com', 'binance.info', 'binance.me', 'binance.us'], path: /^\/bapi\/composite\/v1\/(?:public|friendly)\/antibot/, type: 'antibot api' }
            ]
        },
        {
            vendorId: 'basilisk', detectorId: 'basilisk', className: 'BasiliskCaptchaAdvanced',
            productName: 'Basilisk Captcha', logo: 'basilisk_official.png', infoKey: 'advancedInfoCaptchaScriptsDesc',
            scripts: [
                { domains: ['basiliskcaptcha.com'], path: /^\/challenge\/check-site/, type: 'check-site' },
                { domains: ['basiliskcaptcha.com'], type: 'basilisk' }
            ]
        },
        {
            vendorId: 'aliexpress', detectorId: 'aliexpress', className: 'AliExpressCaptchaAdvanced',
            productName: 'AliExpress CAPTCHA', logo: 'aliexpress_official.png', infoKey: 'advancedInfoCaptchaScriptsDesc',
            scripts: [
                { domains: ['aliexpress.com'], path: /^\/+(?:bx\/)?(?:_____tmd_____\/)?punish/, type: 'punish page' },
                { hosts: ['g.alicdn.com'], path: /^\/bsop-static\/sufei-punish\//, type: 'punish script' }
            ]
        }
    ];

    // Extract Site Key rules for vendors with their own module (hCaptcha, FunCaptcha, reCAPTCHA)
    const siteKeyOnly = {
        hcaptcha: {
            vendorId: 'hcaptcha', productName: 'hCaptcha',
            scripts: [{ domains: ['hcaptcha.com'], type: 'hcaptcha' }],
            siteKey: {
                label: 'sitekey',
                key: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
                rules: [
                    { type: 'attr', selector: '.h-captcha[data-sitekey]', attr: 'data-sitekey', source: 'widget',
                        fields: { theme: 'data-theme', size: 'data-size', callback: 'data-callback' } },
                    // checksiteconfig?sitekey= and the widget frame's #...&sitekey=
                    { type: 'url', url: /^https:\/\/(?:[a-z0-9-]+\.)*hcaptcha\.com\//, param: 'sitekey' },
                    { type: 'inline', hint: 'sitekey', pattern: /sitekey["']?\s*:\s*["']([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})["']/ }
                ]
            }
        },
        funcaptcha: {
            vendorId: 'funcaptcha', productName: 'FunCaptcha',
            scripts: [{ domains: ['arkoselabs.com', 'funcaptcha.com'], type: 'arkose' }],
            siteKey: {
                label: 'public key',
                // Shown as the key's row title instead of "Site key · public key"
                title: ['advFuncaptchaPublicKey', 'Public Key'],
                key: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
                rules: [
                    { type: 'url', url: /^https:\/\/[a-z0-9-]+\.arkoselabs\.com\/v2\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/api\.js/ },
                    { type: 'url', url: /\/fc\/gt2\/public_key\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/ },
                    // The iframe embed: iframe.arkoselabs.com/<key>/index.html, as a frame or a URL in the page's data
                    { type: 'url', url: /^https:\/\/iframe\.arkoselabs\.com\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\// },
                    { type: 'inline', hint: 'iframe.arkoselabs.com', pattern: /iframe\.arkoselabs\.com\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\// },
                    { type: 'attr', selector: '[data-pkey]', attr: 'data-pkey', source: 'widget' },
                    { type: 'inline', hint: 'public_key', pattern: /public_key["']?\s*[:=]\s*["']([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})["']/ },
                    { type: 'inline', hint: 'pkey', pattern: /pkey["']?\s*[:=]\s*["']([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})["']/ }
                ]
            }
        },
        recaptcha: {
            vendorId: 'recaptcha', productName: 'reCAPTCHA',
            scripts: [{ hosts: ['www.google.com', 'www.recaptcha.net', 'www.gstatic.com', 'www.gstatic.cn'], path: /^\/recaptcha\//, type: 'recaptcha' }],
            siteKey: {
                label: 'sitekey',
                key: /^6L[0-9A-Za-z_-]{38}$/,
                rules: [
                    { type: 'attr', selector: '.g-recaptcha[data-sitekey]', attr: 'data-sitekey', source: 'widget',
                        fields: { action: 'data-action', size: 'data-size', theme: 'data-theme', callback: 'data-callback' } },
                    // v3: api.js?render=<key>; v2 and v3: the anchor and challenge frames' k=
                    { type: 'url', url: /^https:\/\/www\.(?:google\.com|recaptcha\.net)\/recaptcha\/(?:api|enterprise)\.js/, param: 'render' },
                    { type: 'url', url: /^https:\/\/www\.(?:google\.com|recaptcha\.net)\/recaptcha\/(?:api2|enterprise)\/(?:anchor|bframe)/, param: 'k' },
                    { type: 'inline', hint: 'grecaptcha', pattern: /(?:render|execute)\([^)]{0,200}?["'](6L[0-9A-Za-z_-]{38})["']/ },
                    { type: 'inline', hint: '6L', pattern: /sitekey["']?\s*:\s*["'](6L[0-9A-Za-z_-]{38})["']/ },
                    { type: 'fact', name: 'edition', value: 'Enterprise', url: /^https:\/\/www\.(?:google\.com|recaptcha\.net)\/recaptcha\/enterprise/ },
                    { type: 'fact', name: 'version', value: 'v3', url: /\/recaptcha\/(?:api|enterprise)\.js\?(?:[^#]*&)?render=6L/ },
                    { type: 'fact', name: 'version', value: 'v2', selector: '.g-recaptcha[data-sitekey]' }
                ]
            }
        }
    };

    const byVendorId = Object.fromEntries(list.map(vendor => [vendor.vendorId, vendor]));
    const byDetectorId = Object.fromEntries(list.map(vendor => [vendor.detectorId, vendor]));

    const hostMatches = (rule, host) => (rule.hosts || []).includes(host)
        || (rule.domains || []).some(domain => host === domain || host.endsWith('.' + domain));

    /** Analyze Scripts type for a URL of this vendor, or null. http(s) only; hosts are exact. */
    function classify(vendor, url) {
        const entry = typeof vendor === 'string' ? byVendorId[vendor] : vendor;
        if (!entry || !Array.isArray(entry.scripts)) return null;
        let parsed;
        try { parsed = new URL(url); } catch (_) { return null; }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        const host = parsed.hostname.toLowerCase();
        const rule = entry.scripts.find(item => hostMatches(item, host) && (!item.path || item.path.test(parsed.pathname)));
        return rule ? rule.type : null;
    }

    const regex = value => (value instanceof RegExp ? { source: value.source, flags: value.flags } : null);

    /** The site-key rules as JSON-safe data for chrome.scripting arguments. */
    function probeArgs(vendor) {
        const entry = typeof vendor === 'string' ? byVendorId[vendor] : vendor;
        if (!entry || !entry.siteKey) return null;
        return {
            key: regex(entry.siteKey.key),
            // "Scripts on this page" uses the Analyze Scripts rules, paths included
            scripts: (entry.scripts || []).map(rule => ({ hosts: rule.hosts || [], domains: rule.domains || [], path: regex(rule.path) })),
            rules: entry.siteKey.rules.map(rule => ({
                type: rule.type,
                selector: rule.selector || '',
                attr: rule.attr || '',
                fields: rule.fields || null,
                source: rule.source || '',
                url: regex(rule.url),
                param: rule.param || '',
                hint: rule.hint || '',
                pattern: regex(rule.pattern),
                path: rule.path || '',
                name: rule.name || '',
                value: rule.value || ''
            }))
        };
    }

    const api = Object.freeze({ list: Object.freeze(list), byVendorId, byDetectorId, classify, probeArgs, siteKeyOnly: Object.freeze(siteKeyOnly) });
    global.AdvancedCaptchaVendors = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
