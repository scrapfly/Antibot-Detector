/**
 * Extract Site Key engine for CAPTCHA vendors described as data
 * (modules/advanced/captcha-vendors.js). probe() runs in every frame of the
 * page through chrome.scripting, so it is self-contained: no closure, its
 * argument is plain JSON, and it adds nothing to the page. probeGlobals()
 * reads a few page variables in the MAIN world, only when probe() found no
 * key; it walks own data properties and never calls a getter or a function.
 */
const AdvancedSiteKeyProbe = {};

AdvancedSiteKeyProbe.probe = function(args) {
  'use strict';
  const MAX_INLINE_CHARS = 512 * 1024;
  const MAX_ITEMS = 50;
  const toRegex = value => (value && value.source ? new RegExp(value.source, (value.flags || '').replace(/[gy]/g, '')) : null);
  const key = toRegex(args.key);
  const found = [];
  const facts = {};
  const candidates = [];
  const add = (sitekey, source, fields) => {
    const value = typeof sitekey === 'string' ? sitekey.trim() : (typeof sitekey === 'number' ? String(sitekey) : '');
    if (!value || found.length >= MAX_ITEMS || (key && !key.test(value))) return;
    found.push(Object.assign({ sitekey: value, source }, fields || {}));
  };
  const fact = (name, value) => {
    if (name && value !== undefined && value !== null && value !== '' && facts[name] === undefined) facts[name] = String(value).slice(0, 200);
  };
  const fromUrl = (url, rule, pattern) => {
    let match = null;
    if (pattern) {
      match = pattern.exec(url);
      if (!match) return null;
    }
    if (rule.param) {
      // The query first, then the fragment (hCaptcha's frame puts its sitekey after #)
      try {
        const parsed = new URL(url, location.href);
        return parsed.searchParams.get(rule.param) || new URLSearchParams(parsed.hash.slice(1)).get(rule.param);
      } catch (e) { return null; }
    }
    return match && match[1] !== undefined ? match[1] : null;
  };
  const scriptRules = (args.scripts || []).map(rule => ({ hosts: rule.hosts || [], domains: rule.domains || [], path: toRegex(rule.path) }));
  const vendorUrl = parsed => {
    const host = parsed.hostname.toLowerCase();
    return scriptRules.some(rule => (rule.hosts.indexOf(host) !== -1
      || rule.domains.some(domain => host === domain || host.slice(-domain.length - 1) === '.' + domain))
      && (!rule.path || rule.path.test(parsed.pathname)));
  };

  // Every URL the frame knows: script and frame sources, then its resource timing
  const urls = [];
  try {
    document.querySelectorAll('script[src], iframe[src]').forEach(el => {
      const src = el.src || el.getAttribute('src');
      if (src) urls.push(src);
    });
  } catch (e) { /* no DOM access */ }
  try {
    performance.getEntriesByType('resource').forEach(entry => urls.push(entry.name));
  } catch (e) { /* no resource timing */ }
  const seen = new Set();
  for (const url of urls) {
    if (seen.has(url) || candidates.length >= 100) continue;
    seen.add(url);
    try {
      if (vendorUrl(new URL(url, location.href))) candidates.push(url);
    } catch (e) { /* not a URL */ }
  }

  // Inline scripts, read once and only when a rule needs them
  let inlineTexts = null;
  const inline = () => {
    if (inlineTexts) return inlineTexts;
    inlineTexts = [];
    try {
      document.querySelectorAll('script:not([src])').forEach(script => {
        const text = String(script.textContent || '');
        if (text) inlineTexts.push(text.length > MAX_INLINE_CHARS ? text.slice(0, MAX_INLINE_CHARS) : text);
      });
    } catch (e) { /* no script access */ }
    return inlineTexts;
  };

  for (const rule of args.rules || []) {
    const pattern = toRegex(rule.pattern);
    const urlPattern = toRegex(rule.url);
    try {
      if (rule.type === 'attr') {
        document.querySelectorAll(rule.selector).forEach(el => {
          const extra = {};
          Object.keys(rule.fields || {}).forEach(name => { extra[name] = el.getAttribute(rule.fields[name]) || ''; });
          add(rule.attr === 'value' ? (el.value || el.getAttribute('value')) : el.getAttribute(rule.attr), rule.source || 'widget', extra);
        });
      } else if (rule.type === 'url') {
        for (const url of urls) add(fromUrl(url, rule, urlPattern), rule.source || 'request');
      } else if (rule.type === 'inline') {
        for (const text of inline()) {
          if (rule.hint && text.indexOf(rule.hint) === -1) continue;
          const all = new RegExp(pattern.source, pattern.flags + 'g');
          let match;
          let count = 0;
          while ((match = all.exec(text)) && count++ < MAX_ITEMS) {
            add(match[1], rule.source || 'script');
            if (match[0] === '') all.lastIndex++;
          }
        }
      } else if (rule.type === 'fact') {
        if (rule.selector) {
          if (document.querySelector(rule.selector)) fact(rule.name, rule.value);
        } else if (urlPattern) {
          for (const url of urls) {
            if (!urlPattern.test(url)) continue;
            fact(rule.name, rule.param ? fromUrl(url, rule, null) : rule.value);
          }
        } else if (pattern) {
          for (const text of inline()) {
            const match = pattern.exec(text);
            if (match) { fact(rule.name, match[1] !== undefined ? match[1] : rule.value); break; }
          }
        }
      }
    } catch (e) { /* one rule failing never stops the others */ }
  }
  let top = true;
  try { top = window.top === window; } catch (e) { top = false; }
  return { url: location.href, top, found, facts, candidates };
};

AdvancedSiteKeyProbe.probeGlobals = function(args) {
  'use strict';
  const toRegex = value => (value && value.source ? new RegExp(value.source, (value.flags || '').replace(/[gy]/g, '')) : null);
  const key = toRegex(args.key);
  const found = [];
  for (const rule of args.rules || []) {
    if (rule.type !== 'global' || !rule.path) continue;
    let value = window;
    for (const name of rule.path.split('.')) {
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) { value = undefined; break; }
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      // Only plain data properties: no getters, nothing the page could run
      value = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    if ((typeof value === 'string' || (typeof value === 'number' && isFinite(value))) && String(value).length <= 256) {
      const text = String(value).trim();
      if (!key || key.test(text)) found.push({ sitekey: text, source: 'global' });
    }
  }
  return { url: location.href, top: true, found, facts: {}, candidates: [] };
};

/**
 * One entry per key with every place it was seen and the frames it was in;
 * frames that failed or that the extension cannot reach are skipped.
 */
AdvancedSiteKeyProbe.merge = function(frameResults, args) {
  const key = args && args.key && args.key.source ? new RegExp(args.key.source, (args.key.flags || '').replace(/[gy]/g, '')) : null;
  const byKey = new Map();
  const facts = {};
  const candidates = [];
  let pageUrl = '';
  for (const frame of frameResults || []) {
    const result = frame && frame.result;
    if (!result) continue;
    if (result.top && !pageUrl) pageUrl = result.url || '';
    Object.keys(result.facts || {}).forEach(name => { if (facts[name] === undefined) facts[name] = result.facts[name]; });
    (result.candidates || []).forEach(url => { if (!candidates.includes(url)) candidates.push(url); });
    for (const item of result.found || []) {
      if (!item || typeof item.sitekey !== 'string' || (key && !key.test(item.sitekey))) continue;
      const entry = byKey.get(item.sitekey) || { sitekey: item.sitekey, sources: [], fields: {}, frames: [] };
      if (!entry.sources.includes(item.source)) entry.sources.push(item.source);
      Object.keys(item).forEach(name => {
        if (name !== 'sitekey' && name !== 'source' && item[name] && !entry.fields[name]) entry.fields[name] = item[name];
      });
      const frameUrl = result.top ? '' : (result.url || '');
      if (!entry.frames.includes(frameUrl)) entry.frames.push(frameUrl);
      byKey.set(item.sitekey, entry);
    }
  }
  return { keys: Array.from(byKey.values()), facts, candidates, pageUrl };
};

/** Every frame the extension can reach; the page variables only as a fallback. */
AdvancedSiteKeyProbe.extract = async function(tabId, args) {
  const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out reading the page')), ms))]);
  const results = await withTimeout(chrome.scripting.executeScript({
    target: { tabId, allFrames: true }, func: AdvancedSiteKeyProbe.probe, args: [args]
  }), 8000);
  let merged = AdvancedSiteKeyProbe.merge(results, args);
  if (!merged.keys.length && (args.rules || []).some(rule => rule.type === 'global')) {
    try {
      const fallback = await withTimeout(chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: AdvancedSiteKeyProbe.probeGlobals, args: [args]
      }), 4000);
      merged = AdvancedSiteKeyProbe.merge([...(results || []), ...(fallback || [])], args);
    } catch (error) {
      // The page variables are a fallback; what the frames gave stands
    }
  }
  return merged;
};

if (typeof window !== 'undefined') window.AdvancedSiteKeyProbe = AdvancedSiteKeyProbe;
if (typeof module !== 'undefined' && module.exports) module.exports = AdvancedSiteKeyProbe;
