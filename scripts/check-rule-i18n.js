#!/usr/bin/env node
/**
 * Every rule text (rule and pattern descriptions, combination names) of the
 * bundled detectors must have a translation in each detectors/i18n/<locale>.json.
 * A new or changed English text without one fails, listed by rule.
 *
 *   node scripts/check-rule-i18n.js            check (exit 1 when something is missing)
 *   node scripts/check-rule-i18n.js --stale    also list translations no rule uses any more
 *   node scripts/check-rule-i18n.js --missing  print the missing texts as a JSON array (to translate)
 */
const fs = require('fs');
const path = require('path');

const { missingLiterals } = require('./lib/rule-literals');
const { SCRIPT, NOT_USED } = require('./lib/locale-rules');

const root = path.join(__dirname, '..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
// --locale <code> checks one language; --dir <folder> reads <code>.json from another folder (to check a translation before it is installed)
const dictDir = arg('--dir') ? path.resolve(arg('--dir')) : path.join(root, 'detectors/i18n');
// Every UI language but English: the _locales folders
const LOCALES = arg('--locale') ? [arg('--locale')] : fs.readdirSync(path.join(root, '_locales')).filter(l => l !== 'en').sort();
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** English text → where it is used ("Akamai Bot Manager: pattern cookie-1") */
function ruleTexts() {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'detectors/index.json'), 'utf8'));
  const texts = new Map();
  const add = (text, where) => { const t = clean(text); if (t && !texts.has(t)) texts.set(t, where); };
  for (const [category, entry] of Object.entries(index)) {
    if (!entry || !Array.isArray(entry.detectors)) continue;
    for (const id of entry.detectors) {
      const rule = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, `${id}.json`), 'utf8'));
      add(rule.description, `${id}: description`);
      for (const [method, patterns] of Object.entries(rule.detection || {})) {
        (Array.isArray(patterns) ? patterns : []).forEach((p, i) => add(p && p.description, `${id}: ${method} ${p && p.id ? p.id : i + 1}`));
      }
      (rule.combinations || []).forEach((c, i) => add(c && c.name, `${id}: combination ${c && c.id ? c.id : i + 1}`));
    }
  }
  return texts;
}

function main() {
  const texts = ruleTexts();
  const missing = new Map();
  const broken = new Map(); // locale -> problems in translations that exist
  const stale = {};
  for (const locale of LOCALES) {
    const file = path.join(dictDir, `${locale}.json`);
    let dict = {};
    try { dict = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`${locale}: cannot read ${path.relative(root, file)} (${e.message})`); process.exitCode = 1; continue; }
    for (const text of texts.keys()) {
      if (!clean(dict[text])) (missing.get(text) || missing.set(text, []).get(text)).push(locale);
    }
    stale[locale] = Object.keys(dict).filter(k => !texts.has(clean(k)));
    // A translation keeps technical literals as written, uses the language's own letters and script
    let scripted = 0;
    for (const [text, where] of texts) {
      const tr = clean(dict[text]);
      if (!tr) continue;
      const lost = missingLiterals(text, tr);
      if (lost.length) (broken.get(locale) || broken.set(locale, []).get(locale)).push(`${where} — changed ${lost.map(l => `"${l}"`).join(', ')}`);
      if (NOT_USED[locale] && NOT_USED[locale].test(tr)) (broken.get(locale) || broken.set(locale, []).get(locale)).push(`${where} — has letters ${locale} does not use`);
      if (SCRIPT[locale] && SCRIPT[locale].test(tr)) scripted++;
    }
    if (SCRIPT[locale] && scripted / texts.size < 0.85) (broken.get(locale) || broken.set(locale, []).get(locale)).push(`only ${scripted}/${texts.size} texts are written in the ${locale} script`);
  }
  if (process.argv.includes('--missing')) {
    console.log(JSON.stringify([...missing.keys()].map(en => ({ en, context: texts.get(en), locales: missing.get(en) })), null, 1));
    return;
  }
  console.log(`Rule texts: ${texts.size} · languages: ${LOCALES.length}`);
  if (process.argv.includes('--stale')) {
    for (const [locale, keys] of Object.entries(stale)) if (keys.length) console.log(`  ${locale}: ${keys.length} unused translation(s)`);
  }
  if (missing.size) {
    console.error(`\n${missing.size} rule text(s) without a translation:`);
    for (const [text, locales] of missing) console.error(`  ${texts.get(text)} — "${text.slice(0, 70)}" (${locales.length === LOCALES.length ? 'all languages' : locales.join(', ')})`);
    console.error('\nAdd them to detectors/i18n/<locale>.json (node scripts/check-rule-i18n.js --missing lists them as JSON).');
    process.exitCode = 1;
    return;
  }
  if (broken.size) {
    for (const [locale, problems] of broken) {
      console.error(`\n${locale}: ${problems.length} translation problem(s):`);
      for (const line of problems.slice(0, 20)) console.error(`  ${line}`);
      if (problems.length > 20) console.error(`  … ${problems.length - 20} more`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Every rule text is translated.');
}

if (require.main === module) main();
module.exports = { ruleTexts, LOCALES };
