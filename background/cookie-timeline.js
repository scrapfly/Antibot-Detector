/**
 * The protection cookie timeline's recorder (worker only): listens to chrome.cookies.onChanged and keeps, per site,
 * when the cookies the loaded detectors name were set, changed value and went away. Advanced → Check Cookies reads
 * it through WorkerMessages.COOKIE_TIMELINE_GET (extension pages only).
 *
 * The record is chrome.storage.session (memory, cleared when the browser closes): never storage.local, History,
 * backups or diagnostics. It holds names, events, times, expiries and a salted six-character marker of each value,
 * never a value. Private windows (any store but the regular one) are not recorded, nor anything while the extension
 * is switched off. The rules (what to record, the caps) are modules/core/cookie-timeline.js.
 */
(function(root) {
  'use strict';

  const CT = () => root.CookieTimeline;

  /**
   * @param {object} deps
   *   storage    a chrome.storage area (session): get(key) / set(items)
   *   subtle     crypto.subtle (digest)
   *   detectors  async () => the loaded detectors, by category
   *   enabled    async () => false while the extension is switched off
   *   now        () => ms
   *   randomSalt () => a random string (once per browser session)
   *   limits     the caps (CookieTimeline.LIMITS by default)
   *   writeDelay ms to group writes (0 writes after every event)
   */
  function createRecorder(deps) {
    const {
      storage, subtle, detectors, enabled = async () => true, now = () => Date.now(),
      randomSalt, limits = CT().LIMITS, writeDelay = 250
    } = deps;
    let state = null;
    let loading = null;
    let matches = null;
    let queue = Promise.resolve();
    let writeTimer = null;
    let dirty = false;

    async function load() {
      if (state) return state;
      if (!loading) {
        loading = (async () => {
          let stored = null;
          try { stored = (await storage.get(CT().STORAGE_KEY))[CT().STORAGE_KEY]; } catch (_) { stored = null; }
          state = stored && stored.v === 1 && stored.sites && stored.salt ? stored : CT().emptyState(randomSalt());
          return state;
        })();
      }
      return loading;
    }

    async function write() {
      writeTimer = null;
      if (!dirty || !state) return;
      dirty = false;
      try { await storage.set({ [CT().STORAGE_KEY]: state }); } catch (_) { /* over quota or gone: memory still has it */ }
    }

    function scheduleWrite() {
      dirty = true;
      if (writeDelay <= 0) return write();
      if (!writeTimer) writeTimer = setTimeout(() => { queue = queue.then(write); }, writeDelay);
      return null;
    }

    async function matcher() {
      if (!matches) matches = CT().matcher(CT().cookieRules(await detectors()));
      return matches;
    }

    async function handle(changeInfo) {
      const cookie = changeInfo && changeInfo.cookie;
      if (!cookie || !cookie.name) return null;
      if (String(cookie.storeId ?? CT().DEFAULT_STORE_ID) !== CT().DEFAULT_STORE_ID) return null; // private windows
      if (!(await matcher())(cookie.name)) return null;
      if (!(await enabled())) return null;
      const site = CT().siteOf(cookie.domain);
      if (!site) return null;
      const current = await load();
      const cookies = current.sites[site] && current.sites[site].cookies;
      const events = cookies && cookies[cookie.name] ? cookies[cookie.name].events : [];
      const last = events[events.length - 1];
      const value = String(cookie.value || '');
      const mark = changeInfo.removed ? '' : await CT().marker(value, current.salt, subtle);
      const event = CT().classify(changeInfo, last, mark);
      if (!event) return null;
      const expires = !changeInfo.removed && !cookie.session && Number.isFinite(cookie.expirationDate)
        ? Math.round(cookie.expirationDate * 1000) : null;
      CT().record(current, { site, name: cookie.name, event, time: now(), expires, length: value.length, marker: mark }, limits);
      await scheduleWrite();
      return event;
    }

    return {
      /** Queue one onChanged notification; resolves to the event recorded (or null). */
      handle(changeInfo) {
        const run = queue.then(() => handle(changeInfo)).catch(() => null);
        queue = run.then(() => {}, () => {});
        return run;
      },
      /** The record of the site an address belongs to: { site, cookies: { name: events[] }, now }. */
      async get(url) {
        await queue;
        const site = CT().siteOf(url);
        return { site, cookies: site ? CT().forSite(await load(), site) : {}, now: now() };
      },
      /** The rules changed (a save, an update): recompute which names count. */
      invalidate() { matches = null; },
      /** Write now (tests, and before the worker idles). */
      async flush() { await queue; if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; } dirty = true; await write(); }
    };
  }

  const CookieTimelineRecorder = {
    recorder: null,
    _initialized: false,

    registerHandlers(registry) {
      registry[root.WorkerMessages.COOKIE_TIMELINE_GET] = ({ request, sender, sendResponse }) => {
        if (!root.MessageSender.isExtensionPage(sender) || !this.recorder || typeof request.url !== 'string') {
          sendResponse({ status: 'error' });
          return false;
        }
        this.recorder.get(request.url)
          .then(result => sendResponse({ status: 'ok', ...result }))
          .catch(() => sendResponse({ status: 'error' }));
        return true;
      };
    },

    /** Register the listener in the worker's first turn (MV3 cold starts). */
    init() {
      if (this._initialized || typeof chrome === 'undefined' || !chrome.cookies || !chrome.cookies.onChanged
          || !chrome.storage || !chrome.storage.session || !(root.crypto && root.crypto.subtle)) return;
      this._initialized = true;
      let hooked = false;
      this.recorder = createRecorder({
        storage: chrome.storage.session,
        subtle: root.crypto.subtle,
        detectors: async () => {
          const manager = await root.ensureDetectorManagerInitialized();
          if (!hooked && manager && typeof manager.addChangeListener === 'function') {
            hooked = true;
            manager.addChangeListener(() => this.recorder.invalidate());
          }
          return manager ? manager.getAllDetectors() : {};
        },
        enabled: async () => (typeof root.isExtensionEnabled === 'function' ? root.isExtensionEnabled() : true),
        randomSalt: () => Array.from(root.crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
      });
      chrome.cookies.onChanged.addListener((changeInfo) => { this.recorder.handle(changeInfo); });
    }
  };

  CookieTimelineRecorder.createRecorder = createRecorder;
  root.CookieTimelineRecorder = CookieTimelineRecorder;
  if (typeof module !== 'undefined' && module.exports) module.exports = CookieTimelineRecorder;
})(typeof self !== 'undefined' ? self : globalThis);
