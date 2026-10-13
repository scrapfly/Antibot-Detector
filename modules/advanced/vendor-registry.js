/** Shared vendor identity, detector aliases and supported tool operations. */
(function (global) {
    const modules = {
    'recaptcha': {
      name: 'ReCaptchaAdvanced',
      productName: 'reCAPTCHA',
      icon: '🔴'
    },
    'akamai': {
      name: 'AkamaiAdvanced',
      productName: 'Akamai Bot Manager',
      icon: '🔷'
    },
    'shapesecurity': {
      name: 'ShapeSecurityAdvanced',
      productName: 'Shape Security',
      icon: '🔶'
    },
    'incapsula': {
      name: 'ImpervaAdvanced',
      productName: 'Imperva/Incapsula',
      icon: '🔷'
    },
    'aws-waf': {
      name: 'AwsWafAdvanced',
      productName: 'AWS WAF',
      icon: '🟠'
    },
    'geetest': {
      name: 'GeetestAdvanced',
      productName: 'GeeTest',
      icon: '🟣'
    },
    'datadome': {
      name: 'DataDomeAdvanced',
      productName: 'DataDome',
      icon: '🟢'
    },
    'cloudflare': {
      name: 'CloudflareAdvanced',
      productName: 'Cloudflare',
      icon: '🟠'
    },
    'turnstile': {
      name: 'TurnstileAdvanced',
      productName: 'Turnstile',
      icon: '🔵'
    },
    'hcaptcha': {
      name: 'HCaptchaAdvanced',
      productName: 'hCaptcha',
      icon: '🔷'
    },
    'funcaptcha': {
      name: 'FunCaptchaAdvanced',
      productName: 'FunCaptcha',
      icon: '🟣'
    },
  };
    const aliases = Object.freeze({ incapsula: 'imperva', 'aws-waf': 'awswaf' });
    const vendors = Object.freeze(Object.fromEntries(Object.entries(modules).map(([id, entry]) => {
        const vendorId = aliases[id] || id;
        return [vendorId, Object.freeze({ ...entry, vendorId, detectorId: id })];
    })));
    const canonical = id => aliases[String(id || '').replace(/^detect-/, '')] || String(id || '').replace(/^detect-/, '');
    global.AdvancedVendorRegistry = Object.freeze({ modules: Object.freeze(modules), vendors, canonical });
})(globalThis);
