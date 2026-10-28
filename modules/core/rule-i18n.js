/**
 * Rule texts in the UI language: rule and pattern descriptions and
 * combination names are written in English in detectors/*.json. This shows
 * them translated, looked up by their English text:
 *
 *   1. a translation saved in the rule itself (the rule editor's Translations
 *      fields: descriptionI18n / nameI18n = { es: "...", de: "..." })
 *   2. the shipped translation file detectors/i18n/<locale>.json
 *      ({ "English text": "translation" }); Rules → Update stores newer ones
 *      in chrome.storage (scrapfly_rule_i18n)
 *   3. the English text
 *
 * Keyed by text, a changed English text has no translation until one is
 * added, so a stale translation is never shown; text a user wrote has none
 * either unless they add one.
 */
(function(root) {
  'use strict';

  const LOCALES = ['ar', 'cs', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt_BR', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW'];
  const STORAGE_KEY = 'scrapfly_rule_i18n';
  const shipped = {};   // locale -> { english: translation }
  const fromRules = {}; // locale -> { english: translation } (user translations)
  let forced; // undefined: follow the UI language

  const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

  /** _locales folder name for a BCP 47 tag ("pt-BR" → pt_BR, "zh-TW" → zh_TW, "zh-CN" → zh_CN), or null for English. */
  function localeKey(tag) {
    const t = String(tag || '').replace('_', '-').toLowerCase();
    if (!t || t.startsWith('en')) return null;
    if (t.startsWith('pt')) return 'pt_BR';
    // Traditional Chinese: Taiwan, Hong Kong, Macau or the Hant script; every other zh tag is Simplified
    if (t.startsWith('zh')) return /^zh-(tw|hk|mo|hant)\b/.test(t) ? 'zh_TW' : 'zh_CN';
    const base = t.split('-')[0];
    return LOCALES.includes(base) ? base : null;
  }

  function current() {
    if (forced !== undefined) return forced;
    const tag = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : 'en';
    return localeKey(tag);
  }

  /** The text in the UI language (or `locale`), else the English text as given. */
  function t(text, locale) {
    const english = clean(text);
    if (!english) return typeof text === 'string' ? text : '';
    const loc = locale === undefined ? current() : locale;
    if (!loc) return text;
    return (fromRules[loc] && fromRules[loc][english]) || (shipped[loc] && shipped[loc][english]) || text;
  }

  /** A text with its own translations map (descriptionI18n): that map first. */
  function pick(text, map, locale) {
    const loc = locale === undefined ? current() : locale;
    const own = loc && isRecord(map) ? clean(map[loc]) : '';
    return own || t(text, loc);
  }

  /** Index the translations saved in rules ({ category: { id: detector } } or a flat list). */
  function indexRules(rules) {
    for (const key of Object.keys(fromRules)) delete fromRules[key];
    const add = (english, map) => {
      const en = clean(english);
      if (!en || !isRecord(map)) return;
      for (const [loc, value] of Object.entries(map)) {
        const v = clean(value);
        if (!v || !LOCALES.includes(loc)) continue;
        (fromRules[loc] = fromRules[loc] || {})[en] = v;
      }
    };
    const list = Array.isArray(rules) ? rules
      : Object.values(isRecord(rules) ? rules : {}).flatMap(c => (isRecord(c) ? Object.values(c) : []));
    for (const entry of list) {
      const rule = isRecord(entry && entry.detector) ? entry.detector : entry;
      if (!isRecord(rule)) continue;
      add(rule.description, rule.descriptionI18n);
      for (const patterns of Object.values(isRecord(rule.detection) ? rule.detection : {})) {
        for (const pattern of Array.isArray(patterns) ? patterns : []) {
          if (isRecord(pattern)) add(pattern.description, pattern.descriptionI18n);
        }
      }
      for (const combo of Array.isArray(rule.combinations) ? rule.combinations : []) {
        if (isRecord(combo)) add(combo.name, combo.nameI18n);
      }
    }
  }

  /** Use these shipped translations for a locale (merged over what is there). */
  function addShipped(locale, dict) {
    if (!LOCALES.includes(locale) || !isRecord(dict)) return;
    const target = shipped[locale] = shipped[locale] || {};
    for (const [en, value] of Object.entries(dict)) {
      const key = clean(en), v = clean(value);
      if (key && v) target[key] = v;
    }
  }

  /** Load the UI language's file (bundled, then any newer one from Rules → Update). */
  const loaded = new Map(); // locale -> Promise (each file is read once)
  function load(locale) {
    const loc = locale === undefined ? current() : locale;
    if (!loc) return Promise.resolve(false);
    if (!loaded.has(loc)) loaded.set(loc, readLocale(loc));
    return loaded.get(loc);
  }

  /** Is release `tag` (v3.0.8) newer than version `installed` (3.0.7)? Unknown versions count as newer, as before. */
  function newerRelease(tag, installed) {
    const parts = (text) => String(text || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10));
    const a = parts(tag), b = parts(installed);
    if (a.some(Number.isNaN) || b.some(Number.isNaN) || !installed) return true;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  async function readLocale(loc) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return false;
    try {
      const response = await fetch(chrome.runtime.getURL(`detectors/i18n/${loc}.json`));
      if (response.ok) addShipped(loc, await response.json());
    } catch (_) { /* English stays */ }
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const record = stored && stored[STORAGE_KEY];
      const updated = record && record.dicts;
      // Downloaded from a release older than (or as old as) this build, they would lay old wording over the
      // translations this build ships: only a newer release's files count
      const installed = chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '';
      if (isRecord(updated) && isRecord(updated[loc]) && newerRelease(record.tag, installed)) addShipped(loc, updated[loc]);
    } catch (_) { /* bundled only */ }
    return true;
  }

  const api = {
    LOCALES, STORAGE_KEY, localeKey, current, t, pick, indexRules, addShipped, load, newerRelease,
    /** Tests: pin the locale (null = English, undefined = follow the UI) */
    setLocale(loc) { forced = loc; }
  };
  root.RuleI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
