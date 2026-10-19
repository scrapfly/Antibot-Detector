#!/usr/bin/env node
/**
 * Translation quality checks for every _locales/<language>/messages.json,
 * against English. check-locale-keys.js proves the key sets match; this proves
 * the texts are fit to ship:
 *
 *   errors (exit 1)
 *     - an empty or non-string message
 *     - a placeholder or protected token that differs from English: {0}, $1,
 *       <SITEURL>, %s, `code`, URLs, HTML tags and entities, line breaks
 *     - the Web Store limits: extensionName 75 characters, extensionDescription 132
 *     - a message left in the wrong script (a Russian text in the Arabic file),
 *       or letters of the sister language (Russian letters in Ukrainian,
 *       Simplified-only characters in Traditional Chinese, and the reverse)
 *     - a character no bundled font draws, in a language whose script ships a font
 *       (the language would silently mix in system fonts)
 *     - mojibake, "undefined", "[object Object]", TODO
 *   warnings (shown with --verbose; exit 0)
 *     - a Latin-script text identical to English when most other languages
 *       translated it, English words left inside a translation, and a text
 *       more than 2.5 times as long as English (it may overflow a button)
 *
 *   node scripts/check-locale-quality.js                  every language
 *   node scripts/check-locale-quality.js --locale uk      one language
 *   node scripts/check-locale-quality.js --locale uk --verbose   also list each finding
 */
const fs = require('fs');
const path = require('path');
const { fontCodePoints } = require('./lib/woff2-cmap');

const root = path.join(__dirname, '..');
const localesDir = path.join(root, '_locales');
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const only = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null;
// --dir <folder>: check the language folders in another _locales-shaped folder (English still comes from the repository)
const dir = args.includes('--dir') ? path.resolve(args[args.indexOf('--dir') + 1]) : null;

const readMessages = (locale) => JSON.parse(fs.readFileSync(path.join(locale !== 'en' && dir ? dir : localesDir, locale, 'messages.json'), 'utf8'));
const english = readMessages('en');
const locales = fs.readdirSync(dir || localesDir).filter(l => fs.statSync(path.join(dir || localesDir, l)).isDirectory()).sort();
const checked = only ? [only] : locales.filter(l => l !== 'en');
if (only && !locales.includes(only)) { console.error(`No ${only} folder in ${dir || localesDir}`); process.exit(2); }

const { SCRIPT, NOT_USED, SYSTEM_FONT_LOCALES } = require('./lib/locale-rules');
const LATIN = (l) => !SCRIPT[l];

// ---- Fonts -----------------------------------------------------------------------
const fontsDir = path.join(root, 'assets/fonts');
const drawn = new Set();
for (const file of fs.readdirSync(fontsDir).filter(f => f.endsWith('-Regular.woff2'))) {
  for (const point of fontCodePoints(path.join(fontsDir, file))) drawn.add(point);
}
const undrawn = (text) => [...new Set([...text])].filter(c => c.codePointAt(0) > 0x7f && !drawn.has(c.codePointAt(0)) && !/[\s\p{Cf}\uFE00-\uFE0F]/u.test(c));
const englishUndrawn = new Set(undrawn(Object.values(english).map(v => v.message).join('')));

// ---- Tokens that must survive translation ------------------------------------------
const { tokensOf, codeSpans, lineBreaks } = require('./lib/locale-tokens');
const lines = lineBreaks;
const words = (text) => (text.match(/[A-Za-z]{4,}/g) || []).length;
const ENGLISH_FUNCTION_WORDS = /\b(the|and|your|this|with|for|from|are|has|was|not|you|will|when|can)\b/gi;
const BAD = /\uFFFD|\bundefined\b|\[object Object\]|\bTODO\b|\bFIXME\b/;
// Suspicious only where English does not say it too ("is undefined" is a real JavaScript value in some help texts)
const badIn = (text, en) => { const m = text.match(BAD); return m && !en.includes(m[0]) ? m[0] : null; };

// Latin-script texts that are identical to English in most languages are fine as they are ("Cookies", "URL")
function international(key, locale) {
  let same = 0;
  for (const other of locales) {
    if (other === 'en' || other === locale) continue;
    const m = readCache(other)[key];
    if (m && m.message === english[key].message) same++;
  }
  return same >= 3;
}
const cache = new Map();
function readCache(locale) { if (!cache.has(locale)) cache.set(locale, readMessages(locale)); return cache.get(locale); }

let failed = false;
const rows = [];
for (const locale of checked) {
  const messages = readCache(locale);
  const errors = [], warnings = [];
  const err = (key, why) => errors.push(`${key}: ${why}`);
  const warn = (key, why) => warnings.push(`${key}: ${why}`);
  let scriptTotal = 0, scriptHit = 0;

  for (const [key, source] of Object.entries(english)) {
    const entry = messages[key];
    if (!entry || typeof entry.message !== 'string' || !entry.message.trim()) { err(key, 'missing or empty'); continue; }
    const text = entry.message, en = source.message;
    if (badIn(text, en)) err(key, `suspicious text "${text.slice(0, 50)}"`);
    if (codeSpans(en) !== codeSpans(text)) err(key, `${codeSpans(en)} code span(s) in English, ${codeSpans(text)} here`);
    const a = tokensOf(en).join('|'), b = tokensOf(text).join('|');
    if (a !== b) err(key, `placeholders/tokens differ: English [${a}] vs [${b}]`);
    if (lines(en) !== lines(text)) err(key, 'line breaks differ from English');
    if (NOT_USED[locale] && NOT_USED[locale].test(text)) err(key, `has letters ${locale} does not use: "${(text.match(NOT_USED[locale]) || [])[0]}"`);
    const missing = undrawn(text).filter(c => !englishUndrawn.has(c));
    if (missing.length && !SYSTEM_FONT_LOCALES.has(locale)) err(key, `characters no bundled font draws: ${missing.join('')}`);

    const isText = /[A-Za-z]{4,}/.test(en) && !/^[<{]/.test(en.trim());
    if (SCRIPT[locale] && isText && words(en) >= 1 && !/^[A-Z0-9 /+._\-]+$/.test(en)) {
      scriptTotal++;
      if (SCRIPT[locale].test(text)) scriptHit++; else if (!international(key, locale)) warn(key, `no ${locale} script in "${text.slice(0, 40)}" (English: "${en.slice(0, 40)}")`);
    }
    if (LATIN(locale) && isText && text === en && !international(key, locale)) warn(key, `identical to English: "${en.slice(0, 50)}"`);
    if (LATIN(locale) || locale === 'ru' || locale === 'uk') {
      const stray = (text.match(ENGLISH_FUNCTION_WORDS) || []).length;
      if (stray >= 2 && text !== en) warn(key, `English words inside: "${text.slice(0, 60)}"`);
    }
    if (en.length >= 14 && text.length > en.length * 2.5) warn(key, `${(text.length / en.length).toFixed(1)}× the English length`);
  }
  if (SCRIPT[locale] && scriptTotal && scriptHit / scriptTotal < 0.85) err('(script)', `only ${scriptHit}/${scriptTotal} texts are written in the ${locale} script`);
  // Web Store limits
  const name = (messages.extensionName || {}).message || '', description = (messages.extensionDescription || {}).message || '';
  if ([...name].length > 75) err('extensionName', `${[...name].length} characters (Web Store limit 75)`);
  if ([...description].length > 132) err('extensionDescription', `${[...description].length} characters (Web Store limit 132)`);

  if (errors.length) failed = true;
  rows.push({ locale, errors, warnings });
}

for (const { locale, errors, warnings } of rows) {
  console.log(`${locale.padEnd(6)} ${errors.length ? 'FAIL' : 'ok  '}  ${errors.length} error(s), ${warnings.length} warning(s)`);
  for (const line of errors.slice(0, verbose ? 500 : 5)) console.log(`         ✖ ${line}`);
  if (errors.length > 5 && !verbose) console.log(`         … ${errors.length - 5} more (--verbose)`);
  if (verbose) for (const line of warnings) console.log(`         ⚠ ${line}`);
}
const englishName = (english.extensionName || {}).message || '', englishDescription = (english.extensionDescription || {}).message || '';
if ([...englishName].length > 75 || [...englishDescription].length > 132) { console.error('English extensionName/extensionDescription exceed the Web Store limits'); failed = true; }
console.log(failed ? '\nTranslation checks failed.' : '\nTranslation checks passed.');
process.exit(failed ? 1 : 0);
