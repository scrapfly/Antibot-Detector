/**
 * Extract Site Key result window for CAPTCHA vendors (AdvancedSiteKeyProbe):
 * one card per key with where it was found, the page facts, and, when no key
 * was found, the vendor's scripts on the page with Export Code.
 */
const AdvancedSiteKeyView = {};

AdvancedSiteKeyView.SOURCE_LABELS = {
  widget: ['advSiteKeySourceWidget', 'Widget'],
  request: ['advSiteKeySourceRequest', 'Request'],
  script: ['advSiteKeySourceScript', 'Page script'],
  global: ['advSiteKeySourceGlobal', 'Page variable'],
  frame: ['advSiteKeySourceRequest', 'Request']
};

/**
 * @param {BaseAdvancedModule} owner - opens the window and records the result
 * @param {{ productName: string, siteKey: { label: string } }} vendor
 * @param {{ keys: Array, facts: object, candidates: string[], pageUrl: string }} result
 * @param {{ classify?: Function, keyLabel?: string }} [options]
 */
AdvancedSiteKeyView.show = function(owner, vendor, result, options = {}) {
  const K = BaseAdvancedModule;
  const tr = K._tr, fmt = K._fmt;
  const name = vendor.productName;
  const label = options.keyLabel || (vendor.siteKey && vendor.siteKey.label) || 'sitekey';
  const keys = (result && result.keys) || [];
  const facts = (result && result.facts) || {};
  const sourceLabel = source => {
    const entry = AdvancedSiteKeyView.SOURCE_LABELS[source];
    return entry ? tr(entry[0], entry[1]) : String(source || '');
  };
  // The vendor's own name for its key, after the translated "Site key"
  const ownTitle = vendor.siteKey && vendor.siteKey.title;
  const keyTitle = ownTitle ? tr(ownTitle[0], ownTitle[1])
    : /^site[_ ]?key$/i.test(label) ? tr('advCommonSiteKey', 'Site Key') : `${tr('advCommonSiteKey', 'Site Key')} · ${label}`;
  const factRows = Object.keys(facts).map(fact => ({ label: fact, value: facts[fact] }));
  const pageRow = result && result.pageUrl ? K.kitCard(K.kitField(tr('advCommonPage', 'Page'), result.pageUrl, { mono: false, wrap: true })) : '';

  const cards = keys.map(entry => {
    const frames = (entry.frames || []).filter(Boolean);
    const rows = K.kitField(keyTitle, entry.sitekey, { wrap: true })
      + Object.keys(entry.fields || {}).map(field => K.kitField(field, entry.fields[field], { wrap: true })).join('')
      + frames.map(frame => K.kitField(tr('advSiteKeyFrame', 'Frame'), frame, { clamp: true })).join('');
    const head = `<span class="adv-kit-label">${FormatUtils.escapeHtml(tr('advSiteKeyFoundIn', 'Found in'))}</span>`
      + (entry.sources || []).map(source => K.kitChip(sourceLabel(source), 'blue')).join('');
    return K.kitCard(rows, head);
  }).join('');

  const scripts = ((result && result.candidates) || []).map(url => ({
    url,
    type: (typeof options.classify === 'function' && options.classify(url)) || ''
  }));
  const scriptCards = scripts.map(script => K.kitCard(
    K.kitField(tr('advCommonUrl', 'URL'), script.url, { clamp: true }),
    script.type ? K.kitChip(script.type, 'neutral') : ''
  )).join('');

  const body = keys.length
    ? K.kitFacts(factRows) + cards + pageRow
    : K.kitNote(tr('advSiteKeyNotFound', 'No site key found on this page. Open or trigger the CAPTCHA, then try again.'))
      + K.kitFacts(factRows)
      + (scriptCards ? K.kitSection(tr('advSiteKeyScriptsOnPage', 'Scripts on this page'), scriptCards, scripts.length) : '')
      + pageRow;

  owner.recordStructuredResult('extractSiteKey', {
    vendorId: owner.moduleName, keys: keys.map(entry => ({ sitekey: entry.sitekey, sources: entry.sources, fields: entry.fields, frames: entry.frames })),
    facts, scripts, pageUrl: result && result.pageUrl
  });
  let host = '';
  try { host = new URL(result.pageUrl || owner.tabInfo.url).hostname; } catch (_) { host = ''; }
  return owner.openKitModal({
    title: fmt('advSiteKeyTitleFmt', `${name} site key`, name),
    subtitle: host,
    iconSvg: K.toolIcon('sitekey'),
    body,
    copiedMessage: tr('advValueCopied', 'Value copied'),
    actions: !keys.length && scripts.length ? [{
      label: tr('advCommonExportCode', 'Export Code'),
      primary: true,
      onClick: () => AdvancedCodeDialog.openScriptUrls(owner, name, scripts)
    }] : [],
    record: false
  });
};

/**
 * Extract Site Key for a module: probe every frame with the vendor's rules,
 * then show the result. Used by the data-driven CAPTCHAs and by hCaptcha,
 * FunCaptcha and reCAPTCHA (AdvancedCaptchaVendors.siteKeyOnly).
 */
AdvancedSiteKeyView.extractFor = async function(owner, vendor, options = {}) {
  if (!owner.tabInfo || !owner.tabInfo.id) throw new Error('Tab information not available');
  const result = await AdvancedSiteKeyProbe.extract(owner.tabInfo.id, AdvancedCaptchaVendors.probeArgs(vendor));
  return AdvancedSiteKeyView.show(owner, vendor, result, { classify: url => AdvancedCaptchaVendors.classify(vendor, url), ...options });
};

if (typeof window !== 'undefined') window.AdvancedSiteKeyView = AdvancedSiteKeyView;
