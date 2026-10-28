/**
 * CookieTimeline: when a site's protection cookies (Akamai's _abck, Cloudflare's cf_clearance, DataDome's datadome...)
 * were set, changed value, and went away, so the person can see how long a protection's session token lives.
 *
 * Pure (no browser APIs: the digest is a parameter), shared by the worker's recorder (background/cookie-timeline.js),
 * the popup's Check Cookies window and the tests.
 *
 *   siteOf(hostOrUrl)        the registrable site a cookie or a page belongs to (www.shop.example.co.uk → example.co.uk)
 *   keyOf(name, domain)      a cookie's record: its name and domain (__cf_bm of shop.example and of cdn.shop.example
 *                            are two cookies with two lives); nameOf(key) gives the name back
 *   cookieRules(detectors)   the cookie name rules of the loaded, enabled detectors: no list of names is written here
 *   matcher(rules)           name → true when a rule names it, matched as the detection engine matches cookie names
 *   marker(value, salt, digest)   six hex characters of a salted SHA-256: tells two values apart, never stores one
 *   classify(change, last, marker)   the event an onChanged notification is: set, changed, removed, expired, or none
 *   record(state, entry)     adds an event under the caps (events per cookie, cookies per site, sites)
 *   summarize(events)        the cookie's current life: set at, how many changes, the last one, its expiry, its state
 *   relative(ms, locale)     "4 min. ago" / "in 1 hr." in the person's language (Intl.RelativeTimeFormat)
 *
 * Privacy: the record lives in chrome.storage.session only (memory, gone when the browser closes), never in
 * storage.local, History, backups or diagnostics, and holds a cookie's name, the event, its time, the expiry and the
 * value's length and marker: never the value.
 */
(function(root) {
  'use strict';

  const STORAGE_KEY = 'cookieTimeline';
  const DEFAULT_STORE_ID = '0'; // the regular profile; a private window has a store of its own and is never recorded
  const LIMITS = Object.freeze({ sites: 40, cookiesPerSite: 24, eventsPerCookie: 20 });
  const EVENTS = Object.freeze(['set', 'changed', 'removed', 'expired']);

  // Second-level labels under a country code that are sold like a top-level domain (example.co.uk, example.com.br)
  const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gob', 'ne', 'or', 'go', 'mil', 'ltd', 'plc', 'sch', 'nic']);

  const KEY_SEPARATOR = '\t'; // never part of a cookie name or domain

  function keyOf(name, domain) {
    return `${String(name || '')}${KEY_SEPARATOR}${String(domain || '').replace(/^\./, '').toLowerCase()}`;
  }

  function nameOf(key) {
    const text = String(key || '');
    const at = text.indexOf(KEY_SEPARATOR);
    return at === -1 ? text : text.slice(0, at);
  }

  /** The registrable site of a host, a cookie domain (leading dot) or an address; '' when there is none. */
  function siteOf(input) {
    let host = String(input || '').trim().toLowerCase();
    if (!host) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) {
      try { host = new URL(host).hostname; } catch (_) { return ''; }
    }
    host = host.replace(/^\.+/, '').replace(/\.+$/, '');
    if (!host) return '';
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return host; // an IP address
    const labels = host.split('.');
    if (labels.length <= 2) return host;
    const tld = labels[labels.length - 1];
    const second = labels[labels.length - 2];
    const keep = tld.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
    return labels.slice(-keep).join('.');
  }

  /** The cookie name rules of every enabled detector, as { pattern, regex, wholeWord, caseSensitive, detector }. */
  function cookieRules(detectors) {
    const rules = [];
    for (const category of Object.values(detectors || {})) {
      for (const detector of Object.values(category || {})) {
        if (!detector || detector.enabled === false) continue;
        const list = detector.detection && Array.isArray(detector.detection.cookie) ? detector.detection.cookie : [];
        for (const rule of list) {
          if (!rule || typeof rule.name !== 'string' || !rule.name || rule.enabled === false) continue;
          rules.push({
            pattern: rule.name,
            regex: rule.nameRegex === true,
            wholeWord: rule.nameWholeWord === true,
            caseSensitive: rule.nameCaseSensitive === true,
            detector: String(detector.name || detector.id || '')
          });
        }
      }
    }
    return rules;
  }

  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The engine's guard against patterns that backtrack catastrophically (utils/pattern-cache.js)
  const evilRegex = typeof root.isLikelyEvilRegex === 'function' ? root.isLikelyEvilRegex
    : (typeof require === 'function' ? (() => { try { return require('../../utils/pattern-cache.js').isLikelyEvilRegex; } catch (_) { return null; } })() : null);

  /** One rule as a test, with the detection engine's cookie name semantics (exact prefix unless regex, word or *). */
  function compileRule(rule) {
    const flags = rule.caseSensitive ? '' : 'i';
    try {
      // A pattern that can backtrack for seconds on a crafted cookie name (^(a+)+$) names nothing, as in the engine:
      // the recorder runs on every cookie change of every site
      if (rule.regex && typeof evilRegex === 'function' && evilRegex(rule.pattern)) return () => false;
      if (rule.regex) { const re = new RegExp(rule.pattern, flags); return (name) => re.test(name); }
      if (rule.wholeWord) { const re = new RegExp(`\\b${escapeRegExp(rule.pattern)}\\b`, flags); return (name) => re.test(name); }
      if (rule.pattern.includes('*')) {
        const re = new RegExp(`^${escapeRegExp(rule.pattern).replace(/\\\*/g, '.*')}$`, flags);
        return (name) => re.test(name);
      }
    } catch (_) {
      return () => false; // an invalid pattern names nothing, as in the engine
    }
    const pattern = rule.caseSensitive ? rule.pattern : rule.pattern.toLowerCase();
    return (name) => (rule.caseSensitive ? name : name.toLowerCase()).startsWith(pattern);
  }

  /** name → true when one of the rules names the cookie. */
  function matcher(rules) {
    const tests = (rules || []).map(compileRule);
    return (name) => {
      if (!name) return false;
      const text = String(name);
      return tests.some(test => test(text));
    };
  }

  /**
   * Six hex characters of SHA-256(salt + value). The salt is random per browser session, so the marker cannot be
   * looked up in a precomputed table and means nothing outside this session; it only tells two values apart.
   * @param {string} value  @param {string} salt  @param {{ digest: Function }} subtle  crypto.subtle
   */
  async function marker(value, salt, subtle) {
    const bytes = new TextEncoder().encode(`${salt || ''}\u0000${String(value || '')}`);
    const hash = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return Array.from(hash.slice(0, 3), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  const isLive = (event) => event === 'set' || event === 'changed';

  /**
   * The event a chrome.cookies.onChanged notification is, given the cookie's last recorded event.
   *   'set'      the cookie appeared (first time seen, or after it was removed or expired)
   *   'changed'  a new value replaced a live one
   *   'refresh'  the same value written again (only its expiry may have moved): no new event
   *   'removed'  deleted by the site, by the person or evicted
   *   'expired'  its expiry passed
   *   null       the removal half of an overwrite: the 'set' that follows says what happened
   */
  function classify(change, last, newMarker) {
    const removed = Boolean(change && change.removed);
    const cause = change && change.cause;
    if (removed) {
      if (cause === 'overwrite') return null;
      return cause === 'expired' ? 'expired' : 'removed';
    }
    if (!last || !isLive(last.e)) return 'set';
    return last.m === newMarker ? 'refresh' : 'changed';
  }

  function emptyState(salt = '') {
    return { v: 1, salt, sites: {} };
  }

  function latestTime(site) {
    return Number(site && site.updated) || 0;
  }

  /**
   * Records one event. entry: { site, name, event ('set' | 'changed' | 'refresh' | 'removed' | 'expired'), time,
   * expires (ms or null), length, marker }. Mutates and returns state. Oldest events, then the least recently active
   * cookie of the site, then the least recently active site give way at the caps.
   */
  function record(state, entry, limits = LIMITS) {
    const target = state && state.sites ? state : emptyState();
    if (!entry || !entry.site || !entry.name) return target;
    const time = Number(entry.time) || 0;
    const site = target.sites[entry.site] || (target.sites[entry.site] = { updated: time, cookies: {} });
    const cookie = site.cookies[entry.name] || (site.cookies[entry.name] = { events: [] });
    site.updated = Math.max(latestTime(site), time);
    const last = cookie.events[cookie.events.length - 1];
    if (entry.event === 'refresh') {
      if (last && isLive(last.e)) last.x = entry.expires ?? null;
      cookie.updated = time;
      return target;
    }
    if (!EVENTS.includes(entry.event)) return target;
    const event = { e: entry.event, t: time };
    if (isLive(entry.event)) {
      event.x = entry.expires ?? null;
      event.l = Number(entry.length) || 0;
      event.m = String(entry.marker || '');
    }
    cookie.events.push(event);
    cookie.updated = time;
    if (cookie.events.length > limits.eventsPerCookie) cookie.events.splice(0, cookie.events.length - limits.eventsPerCookie);

    const names = Object.keys(site.cookies);
    if (names.length > limits.cookiesPerSite) {
      names.sort((a, b) => (site.cookies[a].updated || 0) - (site.cookies[b].updated || 0));
      for (const name of names.slice(0, names.length - limits.cookiesPerSite)) delete site.cookies[name];
    }
    const sites = Object.keys(target.sites);
    if (sites.length > limits.sites) {
      sites.sort((a, b) => latestTime(target.sites[a]) - latestTime(target.sites[b]));
      for (const name of sites.slice(0, sites.length - limits.sites)) delete target.sites[name];
    }
    return target;
  }

  /** The recorded cookies of one site, as { name: events[] }: a copy, without the bookkeeping. */
  function forSite(state, site) {
    const entry = state && state.sites && state.sites[site];
    if (!entry) return {};
    return Object.fromEntries(Object.entries(entry.cookies || {}).map(([name, cookie]) => [name, (cookie.events || []).map(e => ({ ...e }))]));
  }

  /**
   * The cookie's current life from its events: { state: 'live' | 'removed' | 'expired' | 'none', setAt, changes,
   * lastChangeAt, expiresAt, endedAt, events }. setAt is the start of the current life (the last 'set'); when that
   * 'set' fell off the capped log, setAt is null and changes counts what is left.
   */
  function summarize(events) {
    const list = Array.isArray(events) ? events : [];
    const last = list[list.length - 1];
    if (!last) return { state: 'none', setAt: null, changes: 0, lastChangeAt: null, expiresAt: null, endedAt: null, events: list };
    if (!isLive(last.e)) {
      // Ended: describe the life that ended, if one was recorded
      let end = list.length - 2;
      while (end >= 0 && !isLive(list[end].e)) end--;
      let begin = end;
      while (begin > 0 && list[begin].e !== 'set' && isLive(list[begin - 1].e)) begin--;
      const life = end >= 0 ? list.slice(begin, end + 1) : [];
      const changes = life.filter(e => e.e === 'changed');
      return {
        state: last.e === 'expired' ? 'expired' : 'removed',
        setAt: life[0] && life[0].e === 'set' ? life[0].t : null,
        changes: changes.length,
        lastChangeAt: changes.length ? changes[changes.length - 1].t : null,
        expiresAt: null,
        endedAt: last.t,
        events: list
      };
    }
    let start = list.length - 1;
    while (start > 0 && list[start].e !== 'set' && isLive(list[start - 1].e)) start--;
    const life = list.slice(start);
    const changes = life.filter(e => e.e === 'changed');
    return {
      state: 'live',
      setAt: life[0].e === 'set' ? life[0].t : null,
      changes: changes.length,
      lastChangeAt: changes.length ? changes[changes.length - 1].t : null,
      expiresAt: Number.isFinite(last.x) ? last.x : null,
      endedAt: null,
      events: list
    };
  }

  const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];

  /** A signed offset in ms as "4 min. ago" (negative) or "in 1 hr." (positive), short style, in the given locale. */
  function relative(ms, locale) {
    const seconds = Math.round(Number(ms) / 1000) || 0;
    const abs = Math.abs(seconds);
    let unit = 'second';
    let value = seconds;
    for (const [name, size] of UNITS) {
      if (abs >= size) { unit = name; value = Math.round(seconds / size); break; }
    }
    try {
      return new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'always', style: 'short' }).format(value, unit);
    } catch (_) {
      return new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'short' }).format(value, unit);
    }
  }

  const api = Object.freeze({
    STORAGE_KEY, DEFAULT_STORE_ID, LIMITS, EVENTS,
    siteOf, keyOf, nameOf, cookieRules, matcher, marker, classify, emptyState, record, forSite, summarize, relative
  });
  root.CookieTimeline = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.CookieTimeline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
