/**
 * Shared vendor identity, detector aliases and supported tool operations: the one place a vendor with
 * Advanced tools is described. displayName is the short name notifications and titles use
 * (productName is the full product name); a data-driven CAPTCHA vendor (captcha-vendors.js) is added
 * with no further entry anywhere.
 */
(function (global) {
    const modules = {
    'recaptcha': {
      name: 'ReCaptchaAdvanced',
      productName: 'reCAPTCHA',
      displayName: 'reCAPTCHA',
      icon: '🔴',
      category: 'captcha',
      logo: 'recaptcha_official.png'
    },
    'akamai': {
      name: 'AkamaiAdvanced',
      productName: 'Akamai Bot Manager',
      displayName: 'Akamai',
      icon: '🔷',
      category: 'antibot',
      logo: 'akamai_official.png'
    },
    'shapesecurity': {
      name: 'ShapeSecurityAdvanced',
      productName: 'Shape Security',
      displayName: 'Shape Security',
      icon: '🔶',
      category: 'antibot',
      logo: 'shape_security_official.png'
    },
    'incapsula': {
      name: 'ImpervaAdvanced',
      productName: 'Imperva/Incapsula',
      displayName: 'Imperva',
      icon: '🔷',
      category: 'antibot',
      logo: 'imperva_official.png'
    },
    'aws-waf': {
      name: 'AwsWafAdvanced',
      productName: 'AWS WAF',
      displayName: 'AWS WAF',
      icon: '🟠',
      category: 'antibot',
      logo: 'aws_official.png'
    },
    'geetest': {
      name: 'GeetestAdvanced',
      productName: 'GeeTest',
      displayName: 'Geetest',
      icon: '🟣',
      category: 'captcha',
      logo: 'geetest_official.png'
    },
    'datadome': {
      name: 'DataDomeAdvanced',
      productName: 'DataDome',
      displayName: 'DataDome',
      icon: '🟢',
      category: 'antibot',
      logo: 'datadome_official.png'
    },
    'cloudflare': {
      name: 'CloudflareAdvanced',
      productName: 'Cloudflare',
      displayName: 'Cloudflare',
      icon: '🟠',
      category: 'antibot',
      logo: 'cloudflare_official.png'
    },
    'turnstile': {
      name: 'TurnstileAdvanced',
      productName: 'Turnstile',
      displayName: 'Turnstile',
      icon: '🔵',
      category: 'captcha',
      logo: 'cloudflare_official.png'
    },
    'hcaptcha': {
      name: 'HCaptchaAdvanced',
      productName: 'hCaptcha',
      displayName: 'hCaptcha',
      icon: '🔷',
      category: 'captcha',
      logo: 'hcaptcha_official.png'
    },
    'funcaptcha': {
      name: 'FunCaptchaAdvanced',
      productName: 'FunCaptcha',
      displayName: 'FunCaptcha',
      icon: '🟣',
      category: 'captcha',
      logo: 'funcaptcha_official.png'
    },
  };
    // CAPTCHA vendors described as data (captcha-vendors.js, loaded first when present)
    const generic = (global.AdvancedCaptchaVendors && global.AdvancedCaptchaVendors.list) || [];
    for (const vendor of generic) {
        if (modules[vendor.detectorId]) continue;
        modules[vendor.detectorId] = { name: vendor.className, productName: vendor.productName, displayName: vendor.productName, icon: '🧩', category: 'captcha', logo: vendor.logo, generic: true };
    }
    const aliases = Object.freeze({ incapsula: 'imperva', 'aws-waf': 'awswaf',
        ...Object.fromEntries(generic.filter(vendor => vendor.detectorId !== vendor.vendorId).map(vendor => [vendor.detectorId, vendor.vendorId])) });
    const vendors = Object.freeze(Object.fromEntries(Object.entries(modules).map(([id, entry]) => {
        const vendorId = aliases[id] || id;
        return [vendorId, Object.freeze({ ...entry, vendorId, detectorId: id })];
    })));
    const canonical = id => aliases[String(id || '').replace(/^detect-/, '')] || String(id || '').replace(/^detect-/, '');
    /** The registry key (detector id) for a stored vendor or detector id, e.g. imperva → incapsula. */
    const registryKey = id => {
        const bare = String(id || '').replace(/^detect-/, '');
        if (modules[bare]) return bare;
        const vendor = vendors[canonical(bare)];
        return vendor ? vendor.detectorId : bare;
    };
    global.AdvancedVendorRegistry = Object.freeze({ modules: Object.freeze(modules), vendors, canonical, registryKey });
})(globalThis);
