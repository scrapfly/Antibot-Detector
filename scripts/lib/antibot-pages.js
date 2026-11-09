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

const DIFFICULTY_TEXT = {
  Low: 'Low means the extension rates this protection as a light obstacle: it usually only filters simple clients, and a real browser or a well-formed browser-like request often gets through.',
  Medium: 'Medium means the extension rates this protection as a real obstacle: expect checks on the browser, on request details, or on both, and expect them to change over time.',
  High: 'High means the extension rates this protection as among the hardest to get past: it typically combines client-side checks with behavioural or server-side scoring.'
};

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

function percent(rule) {
  return `${rule.confidence}%${rule.standalone === false ? ' (corroboration only)' : ''}`;
}

function row(kind, signal, rule) {
  return { kind, signal, confidence: percent(rule), meaning: rule.description || '' };
}

/** The public signals of a detector, grouped by kind, in a fixed order. */
function signalsOf(detector) {
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

const SECTIONS = [
  ['cookie', 'Cookies', 'Cookie names (and values, where one is matched) set on the page. Patterns are regular expressions unless they are plain words.'],
  ['header', 'Response headers', 'HTTP response headers the page or its requests return.'],
  ['url', 'Script and request URLs', 'Addresses of scripts, frames and requests the page loads. These are patterns matched against the full address.'],
  ['content', 'Page and script content', 'Text found inside the page or its scripts.'],
  ['window', 'JavaScript globals (window)', 'Properties the page\'s own JavaScript context exposes on `window`.'],
  ['dom', 'DOM elements', 'Elements matched by CSS selector.'],
  ['payload', 'Request and response payloads', 'Data the page sends to, or receives from, a matching address.']
];

function table(rows) {
  const lines = ['| Signal | Confidence | What it indicates |', '| --- | --- | --- |'];
  for (const r of rows) lines.push(`| ${code(r.signal)} | ${cell(r.confidence)} | ${cell(r.meaning)} |`);
  return lines.join('\n');
}

/** A combination's "when" as one readable sentence, using the rules' own descriptions. */
function whenText(when, names) {
  if (!when) return '';
  if (when.pattern) return names[when.pattern] || when.pattern;
  if (when.all) return when.all.map(w => wrap(w, names)).join(' and ');
  if (when.any) return when.any.map(w => wrap(w, names)).join(' or ');
  if (when.atLeast) return `at least ${when.atLeast} of: ${(when.of || []).map(w => wrap(w, names)).join('; ')}`;
  return '';
}

function wrap(when, names) {
  const text = whenText(when, names);
  return when && (when.all || when.any || when.atLeast) ? `(${text})` : text;
}

function combinationsOf(detector) {
  const names = {};
  for (const list of Object.values(detector.detection || {})) {
    for (const r of list) if (r.id) names[r.id] = r.description || r.id;
  }
  return (detector.combinations || []).map(c => ({
    name: c.name || c.id,
    confidence: `${c.confidence}%`,
    when: whenText(c.when, names)
  }));
}

/** One page. `blurb` is the hand-written "what it is" text (or '' for the generic one). */
function buildPage(detector, blurb) {
  const name = detector.name;
  const signals = signalsOf(detector);
  const total = Object.values(signals).reduce((n, list) => n + list.length, 0);
  const difficulty = detector.difficulty || 'Medium';
  const out = [];

  out.push(`# ${name} bot protection: how to detect it (and what it means for scraping)`);
  out.push('');
  out.push(
    `${name} is a bot protection or anti-abuse layer that some websites put in front of their pages. ` +
    `If you are looking for a ${name} bypass, trying to detect ${name} on a site, or investigating web scraping blocked by ${name}, ` +
    `the first step is the same: confirm that ${name} is really what answers your requests. ` +
    `This page lists the ${total} public signals that the Scrapfly Antibot Detector extension uses to recognise ${name} bot detection, ` +
    `how strongly each one points to it, and what that usually means for an automated client.`
  );
  out.push('');
  out.push('## What it is');
  out.push('');
  out.push(blurb || String(detector.description || `${name} is an anti-bot product`).replace(/\.?$/, '.'));
  out.push('');
  if (detector.website) {
    out.push(`Official site: [${detector.website}](${detector.website})`);
    out.push('');
  }

  out.push(`## How to tell a site uses ${name}`);
  out.push('');
  out.push(
    'These signals are generated from the extension\'s own detection rules for ' +
    `\`${detector.id}\` (rule version ${detector.version || 'n/a'}, last updated ${detector.lastUpdated || 'n/a'}). ` +
    'A signal is only an indication: confidence is how sure the extension is when that one signal is seen. ' +
    'Signals marked "corroboration only" never count on their own, because other products can produce them too.'
  );
  for (const [key, title, intro] of SECTIONS) {
    if (!signals[key].length) continue;
    out.push('');
    out.push(`### ${title}`);
    out.push('');
    out.push(intro);
    out.push('');
    out.push(table(signals[key]));
  }
  const combos = combinationsOf(detector);
  if (combos.length) {
    out.push('');
    out.push('### Combinations');
    out.push('');
    out.push('Some signals score higher together than alone. These combinations are what the extension also reports.');
    out.push('');
    out.push('| Combination | Confidence | Needs |');
    out.push('| --- | --- | --- |');
    for (const c of combos) out.push(`| ${cell(c.name)} | ${cell(c.confidence)} | ${cell(c.when)} |`);
  }
  out.push('');

  out.push('## Difficulty');
  out.push('');
  out.push(`**${difficulty}.** ${DIFFICULTY_TEXT[difficulty] || DIFFICULTY_TEXT.Medium}`);
  out.push('');
  out.push('The rating is the extension\'s own rule of thumb, not a statement by the vendor, and a site\'s configuration can make the same product easier or harder.');
  out.push('');

  out.push('## What it means for scraping');
  out.push('');
  out.push(
    `If ${name} is present, a request that does not look like a real, consistent browser session may be challenged, ` +
    'delayed or refused, and the response can be a challenge or block page instead of the content you wanted. ' +
    'What exactly happens depends on how the site owner configured the product, which can differ from one site to the next ' +
    'and can change without notice. Treat a detection as a reason to look at the response you actually receive, not as a guarantee of a block.'
  );
  out.push('');
  out.push(
    `To scrape pages protected by ${name} without maintaining the workarounds yourself, see Scrapfly's ` +
    `[Anti Scraping Protection documentation](${ASP_URL}) and the [Scrape API](${SCRAPE_API_URL}). ` +
    'Only scrape what you are allowed to, and respect the site\'s terms and robots rules.'
  );
  out.push('');

  out.push('## Detect it with the extension');
  out.push('');
  out.push(
    `Install the free [Scrapfly Anti-bot Detector](${STORE_URL}) for Chrome, browse to the page, and the popup lists ${name} ` +
    'with its confidence, its difficulty and the exact signals that matched. ' +
    'Read more in the [project README](../../README.md), or see [all anti-bot protections the extension detects](README.md).'
  );
  out.push('');
  return out.join('\n');
}

/** The index page: one row per anti-bot detector. `entries` = [{ id, name, difficulty }]. */
function buildIndex(entries) {
  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  const out = [];
  out.push('# Anti-bot protections the Antibot Detector recognises');
  out.push('');
  out.push(
    `One page for each of the ${sorted.length} anti-bot detectors in the [Scrapfly Anti-bot Detector](../../README.md) extension: ` +
    'what the protection is, the public signals that reveal it, how hard it is rated, and what it usually means for web scraping. ' +
    `Pages are generated from the detection rules in \`detectors/antibot/\`. To get past anti-bot systems at scale, see Scrapfly's [Anti Scraping Protection](${ASP_URL}).`
  );
  out.push('');
  out.push('| Protection | Difficulty | Page |');
  out.push('| --- | --- | --- |');
  for (const e of sorted) out.push(`| ${cell(e.name)} | ${cell(e.difficulty || 'Medium')} | [${cell(e.name)}](${slugOf(e.id)}.md) |`);
  out.push('');
  return out.join('\n');
}

module.exports = { slugOf, cell, code, signalsOf, combinationsOf, buildPage, buildIndex, DIFFICULTY_TEXT, STORE_URL, ASP_URL, SCRAPE_API_URL };
