// Turnstile site keys on the inspected tab, for Advanced → Turnstile and
// Advanced → Cloudflare "Extract Site Key" (kept with the Cloudflare tools:
// Turnstile is Cloudflare's; the Turnstile module loads it from here too).
// A key is found in the widget's
// data-sitekey (implicit rendering), in the challenge iframe URL (the iframe
// sits in a closed shadow root, but its request is in the page's resource
// timing) or in an inline turnstile.render({ sitekey }) call. Every frame is
// searched; only Turnstile-shaped keys are kept, so a reCAPTCHA or hCaptcha
// data-sitekey on the same page is not reported.

const TurnstileSiteKeys = {};

// Runs in each frame of the page (chrome.scripting): self-contained, no closure
TurnstileSiteKeys.probe = function() {
  // Production keys start with 0x, Cloudflare's test keys with 1x, 2x or 3x
  const KEY = /^[0-3]x[0-9A-Za-z_-]{18,}$/;
  const found = [];
  const add = (sitekey, source, extra = {}) => {
    if (typeof sitekey === 'string' && KEY.test(sitekey.trim())) found.push({ sitekey: sitekey.trim(), source, ...extra });
  };
  try {
    document.querySelectorAll('[data-sitekey]').forEach(el => {
      const isTurnstile = el.classList.contains('cf-turnstile');
      const key = el.getAttribute('data-sitekey');
      if (!isTurnstile && !KEY.test(String(key || '').trim())) return;
      add(key, 'widget', {
        action: el.getAttribute('data-action') || '',
        cdata: el.getAttribute('data-cdata') || '',
        theme: el.getAttribute('data-theme') || '',
        size: el.getAttribute('data-size') || ''
      });
    });
  } catch (e) {
    // no DOM access
  }
  try {
    const frameUrl = /^https:\/\/challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform\/(?:h\/[a-z0-9]+\/)?turnstile\/(?:if|f)\//;
    for (const entry of performance.getEntriesByType('resource')) {
      if (!frameUrl.test(entry.name)) continue;
      const path = new URL(entry.name).pathname.split('/');
      path.forEach(segment => add(segment, 'frame'));
    }
  } catch (e) {
    // no resource timing
  }
  try {
    const inline = /sitekey["']?\s*[:=]\s*["']([0-3]x[0-9A-Za-z_-]{18,})["']/gi;
    for (const script of document.querySelectorAll('script:not([src])')) {
      for (const match of String(script.textContent || '').matchAll(inline)) add(match[1], 'script');
    }
  } catch (e) {
    // no script access
  }
  return { url: location.href, found };
};

/**
 * Merge the per-frame probe results: one entry per key, every place it was
 * seen, the widget's action/cData when a widget declared them.
 * @returns {Array<{sitekey, sources: string[], action, cdata, theme, size, pageUrl}>}
 */
TurnstileSiteKeys.merge = function(frameResults) {
  const byKey = new Map();
  for (const frame of frameResults || []) {
    const result = frame && frame.result;
    if (!result || !Array.isArray(result.found)) continue;
    for (const item of result.found) {
      const entry = byKey.get(item.sitekey) || { sitekey: item.sitekey, sources: [], action: '', cdata: '', theme: '', size: '', pageUrl: result.url || '' };
      if (!entry.sources.includes(item.source)) entry.sources.push(item.source);
      for (const field of ['action', 'cdata', 'theme', 'size']) {
        if (!entry[field] && item[field]) entry[field] = item[field];
      }
      byKey.set(item.sitekey, entry);
    }
  }
  return Array.from(byKey.values());
};

/** Keys on the tab, from every frame the extension can reach */
TurnstileSiteKeys.extract = async function(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: TurnstileSiteKeys.probe
  });
  return TurnstileSiteKeys.merge(results);
};

if (typeof window !== 'undefined') {
  window.TurnstileSiteKeys = TurnstileSiteKeys;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TurnstileSiteKeys;
}
