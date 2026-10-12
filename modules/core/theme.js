/**
 * Theme: Dark (default), Light (Scrapfly style) or System. Loaded first in the
 * <head> of the popup and the Statistics page so the page paints in the right
 * theme: the choice is mirrored in localStorage (synchronous) and kept in
 * chrome.storage.local (scrapfly_theme) as the source of truth.
 */
(function(root) {
  'use strict';
  const KEY = 'scrapfly_theme';
  const VALUES = ['dark', 'light', 'system'];
  let current = 'dark';
  let media = null;
  let chosen = false; // set() ran: the startup read must not undo it

  const normalize = (value) => (VALUES.includes(value) ? value : 'dark');
  const systemLight = () => {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches); } catch (_) { return false; }
  };
  /** The theme a choice shows: system follows the browser. */
  const resolve = (value) => {
    const choice = normalize(value);
    return choice === 'system' ? (systemLight() ? 'light' : 'dark') : choice;
  };

  function apply(value) {
    current = normalize(value);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', resolve(current));
    }
  }

  function remember(value) {
    try { root.localStorage && root.localStorage.setItem(KEY, value); } catch (_) { /* private mode */ }
  }

  /** Save and apply a choice (Settings → Theme). */
  async function set(value) {
    const choice = normalize(value);
    chosen = true;
    apply(choice);
    remember(choice);
    try { await chrome.storage.local.set({ [KEY]: choice }); } catch (_) { /* applied for this page anyway */ }
    return choice;
  }

  function init() {
    let cached = null;
    try { cached = root.localStorage && root.localStorage.getItem(KEY); } catch (_) { /* none */ }
    apply(cached || 'dark');
    try {
      media = root.matchMedia ? root.matchMedia('(prefers-color-scheme: light)') : null;
      if (media && media.addEventListener) media.addEventListener('change', () => { if (current === 'system') apply(current); });
    } catch (_) { /* no media queries */ }
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(KEY).then((stored) => {
      if (chosen) return;
      const value = normalize(stored && stored[KEY]);
      remember(value);
      if (value !== current) apply(value);
    }).catch(() => {});
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) { apply(changes[KEY].newValue); remember(current); }
      });
    }
  }

  root.ScrapflyTheme = Object.freeze({ KEY, VALUES, resolve, apply, set, init, get: () => current });
  init();
})(typeof window !== 'undefined' ? window : self);
