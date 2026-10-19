/** Parts of a UI text that must come through a translation unchanged. */

const TOKENS = [
  /\{\d+\}/g, /\$\d/g, /%[sd]/g, /<[A-Z_]{3,}>/g, /<\/?[a-z][a-z0-9]*[^>]*>/gi, /&[a-z]+;/gi
];
// A URL ends before the punctuation that follows it in a sentence
const URLS = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%\\]+/g;
const trimUrl = (u) => u.replace(/[.,;:)'!?]+$/, '');
/** Placeholders ({0}, $1, %s, <SITEURL>), HTML and URLs, sorted */
const tokensOf = (text) => [...TOKENS.flatMap(re => text.match(re) || []), ...(text.match(URLS) || []).map(trimUrl)].sort();
// `code spans` keep their count; the words inside a generic example (`.class`, `[attribute]`) may be localized
const codeSpans = (text) => (text.match(/`[^`]*`/g) || []).length;
const lineBreaks = (text) => (text.match(/\n/g) || []).length;

module.exports = { tokensOf, codeSpans, lineBreaks };
