/**
 * Pure builder for the per anti-bot documentation pages (docs/antibots/<slug>.md and its index). Everything that is a signal
 * (cookies, headers, hosts, window objects, DOM, confidence, difficulty, website) is read from the detector's JSON, so a page
 * cannot drift from the rules; only the short "what it is" blurb is hand written (scripts/lib/antibot-blurbs.json).
 * No file access here: scripts/generate-antibot-pages.js reads and writes.
 */
'use strict';

const STORE_URL = 'https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca';
const ASP_URL = 'https://scrapfly.io/docs/scrape-api/anti-scraping-protection';
const SCRAPE_API_URL = 'https://scrapfly.io/docs/scrape-api/getting-started';

const EN = require('./antibot-pages-i18n/en.json');

/** Languages of the pages, English first: code, native name, README file name. English pages live in docs/antibots/, the rest in docs/antibots/<code>/. */
const LANGS = [
  { code: 'en', name: 'English', readme: 'README.md' },
  { code: 'es', name: 'Espa\u00f1ol', readme: 'README.es.md' },
  { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', readme: 'README.ru.md' },
  { code: 'zh-CN', name: '\u7b80\u4f53\u4e2d\u6587', readme: 'README.zh-CN.md' },
  { code: 'ja', name: '\u65e5\u672c\u8a9e', readme: 'README.ja.md' },
  { code: 'pt-BR', name: 'Portugu\u00eas (Brasil)', readme: 'README.pt-BR.md' },
  { code: 'de', name: 'Deutsch', readme: 'README.de.md' },
  { code: 'fr', name: 'Fran\u00e7ais', readme: 'README.fr.md' },
  { code: 'ko', name: '\ud55c\uad6d\uc5b4', readme: 'README.ko.md' }
];

/** Fills {name} placeholders. */
function fmt(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

/** Language switcher: the current language in bold, the others linked to the same page ('' = the index). */
function switcher(lang, page) {
  const file = page ? `${page}.md` : 'README.md';
  return LANGS.map(l => {
    if (l.code === lang) return `**${l.name}**`;
    const dir = l.code === 'en' ? (lang === 'en' ? '' : '../') : (lang === 'en' ? `${l.code}/` : `../${l.code}/`);
    return `[${l.name}](${dir}${file})`;
  }).join(' | ');
}

/** Link to the project README in the language's own copy, from the page's folder. */
function readmeHref(lang) {
  const l = LANGS.find(x => x.code === lang) || LANGS[0];
  return lang === 'en' ? '../../README.md' : `../../${l.readme}`;
}

/** "detect-aws-waf" -> "aws-waf" */
function slugOf(id) {
  return String(id).replace(/^detect-/, '');
}

/** Text for a Markdown table cell: no line breaks, pipes escaped. */
function cell(text) {
  return String(text == null ? '' : text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** A code span that survives backticks and pipes inside a table cell. */
function code(text) {
  const raw = String(text == null ? '' : text).replace(/\r?\n/g, ' ');
  const fence = raw.includes('`') ? '``' : '`';
  const padded = raw.startsWith('`') || raw.endsWith('`') ? ` ${raw} ` : raw;
  return `${fence}${padded}${fence}`.replace(/\|/g, '\\|');
}

function percent(rule, t) {
  return `${rule.confidence}%${rule.standalone === false ? ` (${t.corroborationOnly})` : ''}`;
}

/** The public signals of a detector, grouped by kind, in a fixed order. */
function signalsOf(detector, t = EN) {
  const row = (kind, signal, rule) => ({ kind, signal, confidence: percent(rule, t), meaning: rule.description || '' });
  const d = detector.detection || {};
  const out = { cookie: [], header: [], url: [], content: [], window: [], dom: [], payload: [] };
  for (const r of d.cookie || []) {
    out.cookie.push(row('cookie', r.value ? `${r.name} = ${r.value}` : r.name, r));
  }
  for (const r of d.header || []) {
    out.header.push(row('header', r.value ? `${r.name}: ${r.value}` : r.name, r));
  }
  for (const r of d.url || []) out.url.push(row('url', r.text, r));
  for (const r of d.content || []) out.content.push(row('content', r.text, r));
  for (const r of d.window || []) out.window.push(row('window', r.condition ? `${r.path} (${r.condition})` : r.path, r));
  for (const r of d.dom || []) out.dom.push(row('dom', r.selector, r));
  for (const r of d.payload || []) {
    const parts = [];
    if (r.urlPattern) parts.push(`URL ${r.urlPattern}`);
    if (r.text) parts.push(`${r.body === 'response' ? 'response' : 'body'} ${r.text}`);
    out.payload.push(row('payload', parts.join(' ; '), r));
  }
  return out;
}

const SECTIONS = ['cookie', 'header', 'url', 'content', 'window', 'dom', 'payload'];

function table(rows, t) {
  const lines = [`| ${t.tableSignal} | ${t.tableConfidence} | ${t.tableMeaning} |`, '| --- | --- | --- |'];
  for (const r of rows) lines.push(`| ${code(r.signal)} | ${cell(r.confidence)} | ${cell(r.meaning)} |`);
  return lines.join('\n');
}

/** A combination's "when" as one readable sentence, using the rules' own descriptions. */
function whenText(when, names, t = EN) {
  if (!when) return '';
  if (when.pattern) return names[when.pattern] || when.pattern;
  if (when.all) return when.all.map(w => wrap(w, names, t)).join(t.joinAnd);
  if (when.any) return when.any.map(w => wrap(w, names, t)).join(t.joinOr);
  if (when.atLeast) return fmt(t.atLeast, { n: when.atLeast, list: (when.of || []).map(w => wrap(w, names, t)).join('; ') });
  return '';
}

function wrap(when, names, t) {
  const text = whenText(when, names, t);
  return when && (when.all || when.any || when.atLeast) ? `(${text})` : text;
}

function combinationsOf(detector, t = EN) {
  const names = {};
  for (const list of Object.values(detector.detection || {})) {
    for (const r of list) if (r.id) names[r.id] = r.description || r.id;
  }
  return (detector.combinations || []).map(c => ({
    name: c.name || c.id,
    confidence: `${c.confidence}%`,
    when: whenText(c.when, names, t)
  }));
}

/**
 * One page. `blurb` is the hand-written "what it is" text (or '' for the generic one), `t` the language's string table
 * (English by default) and `lang` its code (for the switcher and the README link).
 */
function buildPage(detector, blurb, t = EN, lang = 'en') {
  const name = detector.name;
  const signals = signalsOf(detector, t);
  const total = Object.values(signals).reduce((n, list) => n + list.length, 0);
  const difficulty = ['Low', 'Medium', 'High'].includes(detector.difficulty) ? detector.difficulty : 'Medium';
  const out = [];

  out.push(switcher(lang, slugOf(detector.id)));
  out.push('');
  out.push(`# ${fmt(t.title, { name })}`);
  out.push('');
  out.push(fmt(t.intro, { name, total }));
  out.push('');
  out.push(`## ${t.headingWhat}`);
  out.push('');
  out.push(blurb || (detector.description ? String(detector.description).replace(/\.?$/, '.') : fmt(t.fallbackBlurb, { name })));
  out.push('');
  if (detector.website) {
    out.push(`${t.officialSite}: [${detector.website}](${detector.website})`);
    out.push('');
  }

  out.push(`## ${fmt(t.headingHow, { name })}`);
  out.push('');
  out.push(fmt(t.howIntro, { id: detector.id, version: detector.version || t.notAvailable, updated: detector.lastUpdated || t.notAvailable }));
  for (const key of SECTIONS) {
    if (!signals[key].length) continue;
    const Key = key[0].toUpperCase() + key.slice(1);
    out.push('');
    out.push(`### ${t[`section${Key}`]}`);
    out.push('');
    out.push(t[`section${Key}Intro`]);
    out.push('');
    out.push(table(signals[key], t));
  }
  const combos = combinationsOf(detector, t);
  if (combos.length) {
    out.push('');
    out.push(`### ${t.headingCombinations}`);
    out.push('');
    out.push(t.combinationsIntro);
    out.push('');
    out.push(`| ${t.tableCombination} | ${t.tableConfidence} | ${t.tableNeeds} |`);
    out.push('| --- | --- | --- |');
    for (const c of combos) out.push(`| ${cell(c.name)} | ${cell(c.confidence)} | ${cell(c.when)} |`);
  }
  out.push('');

  out.push(`## ${t.headingDifficulty}`);
  out.push('');
  out.push(`**${t[`difficulty${difficulty}`]}.** ${t[`difficultyText${difficulty}`]}`);
  out.push('');
  out.push(t.difficultyNote);
  out.push('');

  out.push(`## ${t.headingScraping}`);
  out.push('');
  out.push(fmt(t.scrapingMeaning, { name }));
  out.push('');
  out.push(fmt(t.scrapingScrapfly, { name, aspLink: `[${t.linkAsp}](${ASP_URL})`, apiLink: `[${t.linkApi}](${SCRAPE_API_URL})` }));
  out.push('');

  out.push(`## ${t.headingDetect}`);
  out.push('');
  out.push(fmt(t.detectText, {
    name,
    storeLink: `[${t.linkStore}](${STORE_URL})`,
    readmeLink: `[${t.linkReadme}](${readmeHref(lang)})`,
    allLink: `[${t.linkAll}](README.md)`
  }));
  out.push('');
  return out.join('\n');
}

/** The index page: one row per anti-bot detector. `entries` = [{ id, name, difficulty }]. */
function buildIndex(entries, t = EN, lang = 'en') {
  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  const out = [];
  out.push(switcher(lang, ''));
  out.push('');
  out.push(`# ${t.indexTitle}`);
  out.push('');
  out.push(fmt(t.indexIntro, {
    count: sorted.length,
    extLink: `[${t.linkStore}](${readmeHref(lang)})`,
    aspLink: `[${t.linkAspShort}](${ASP_URL})`
  }));
  out.push('');
  out.push(`| ${t.indexProtection} | ${t.indexDifficulty} | ${t.indexPage} |`);
  out.push('| --- | --- | --- |');
  for (const e of sorted) {
    const d = ['Low', 'Medium', 'High'].includes(e.difficulty) ? e.difficulty : 'Medium';
    out.push(`| ${cell(e.name)} | ${cell(t[`difficulty${d}`])} | [${cell(e.name)}](${slugOf(e.id)}.md) |`);
  }
  out.push('');
  return out.join('\n');
}

module.exports = { slugOf, cell, code, fmt, signalsOf, combinationsOf, buildPage, buildIndex, switcher, readmeHref, LANGS, STORE_URL, ASP_URL, SCRAPE_API_URL };
