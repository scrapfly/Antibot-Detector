const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan } = require('../modules/core/rule-translation-plan.js');

const LOCALES = ['de', 'es', 'fr'];
const none = () => '';

test('a text with no translation anywhere is missing every language', () => {
  const result = plan([{ id: 'detector', kind: 'detector', text: 'Bot detection', own: {} }], LOCALES, none);
  assert.deepEqual(result, { jobs: [{ id: 'detector', kind: 'detector', text: 'Bot detection', missing: ['de', 'es', 'fr'] }], texts: 1, gaps: 3, locales: ['de', 'es', 'fr'] });
});

test('a language is covered by a translation typed in the rule or one the extension ships', () => {
  const shipped = (text, locale) => (text === 'Known text' && locale === 'fr' ? 'Texte connu' : '');
  const result = plan([
    { id: 'a', kind: 'pattern', text: 'Known text', own: { de: 'Bekannter Text' } },
    { id: 'b', kind: 'combination', text: 'Other', own: { es: '  ', fr: 'Autre' } }
  ], LOCALES, shipped);
  assert.deepEqual(result.jobs.map(job => [job.id, job.missing]), [['a', ['es']], ['b', ['de', 'es']]], 'blank typed text counts as none');
  assert.equal(result.texts, 2);
  assert.equal(result.gaps, 3);
  assert.deepEqual(result.locales, ['de', 'es']);
});

test('a text that is complete is not listed, and neither is an empty one', () => {
  const full = { de: 'a', es: 'b', fr: 'c' };
  const result = plan([
    { id: 'done', kind: 'pattern', text: 'Done', own: full },
    { id: 'blank', kind: 'pattern', text: '   ', own: {} },
    { id: 'none', kind: 'pattern', text: null, own: {} },
    { id: 'todo', kind: 'combination', text: 'To do' }
  ], LOCALES, none);
  assert.deepEqual(result.jobs.map(job => job.id), ['todo']);
});

test('the text is compared as the editor stores it: one line, trimmed', () => {
  const seen = [];
  plan([{ id: 'x', kind: 'pattern', text: '  Two\n  lines  ', own: {} }], ['de'], (text) => { seen.push(text); return ''; });
  assert.deepEqual(seen, ['Two lines']);
});

test('junk in, nothing out', () => {
  for (const texts of [undefined, null, 'x', [null, undefined, 5, {}]]) {
    assert.deepEqual(plan(texts, LOCALES, none), { jobs: [], texts: 0, gaps: 0, locales: [] });
  }
  assert.deepEqual(plan([{ id: 'a', kind: 'pattern', text: 'T', own: [] }], undefined, none).jobs, []);
  assert.equal(plan([{ id: 'a', kind: 'pattern', text: 'T', own: [] }], ['de']).texts, 1, 'no shipped lookup: only what is typed counts');
});

test('the languages are listed in the order given, once', () => {
  const result = plan([
    { id: 'a', kind: 'pattern', text: 'A', own: { de: 'x' } },
    { id: 'b', kind: 'pattern', text: 'B', own: { fr: 'y' } }
  ], ['fr', 'de', 'es'], none);
  assert.deepEqual(result.locales, ['fr', 'de', 'es']);
});
