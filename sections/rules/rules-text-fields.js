/**
 * The texts of a rule in the editor: the detector's description, a pattern's description and a combination's name.
 * Each is one plain box. It shows the text as the interface language shows it (the translation the extension ships
 * for a rule of Scrapfly's, or one an older version saved in the rule), and what is changed in it replaces the text
 * for every language: a text written here is shown as written everywhere. Left as it was shown, the rule keeps its
 * original text and its translations untouched; typed back to what the box showed, the original is put back.
 */
const ruleTextClean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

// The detector's own description is longer than a pattern's; a shipped translation can be longer than either
const RULE_TEXT_MAX = 400;

/** The interface language as a rule-text locale ('es', 'pt_BR'…), or null for English. */
Rules.uiLocale = function() {
  return typeof RuleI18n !== 'undefined' && typeof RuleI18n.current === 'function' ? RuleI18n.current() : null;
};

/** The translation the extension ships for a text in a locale, or ''. */
Rules.shippedText = function(english, locale) {
  const source = ruleTextClean(english);
  const shipped = source && locale && typeof RuleI18n !== 'undefined' ? ruleTextClean(RuleI18n.t(source, locale)) : '';
  return shipped && shipped !== source ? shipped : '';
};

/** What a text shows in a locale: the rule's own translation, the shipped one, else the text itself. */
Rules.shownText = function(english, own, locale) {
  const mine = locale && own && typeof own[locale] === 'string' ? ruleTextClean(own[locale]) : '';
  return mine || Rules.shippedText(english, locale) || ruleTextClean(english);
};

/** A { locale: text } map, from the map itself or its JSON (a row's data attribute); {} for anything else. */
Rules.parseTextMap = function(raw) {
  let map = raw;
  if (typeof raw === 'string') {
    try { map = raw ? JSON.parse(raw) : {}; } catch (_) { map = {}; }
  }
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
};

/**
 * Put a text in its box, as the interface language shows it. The shipped translations of that language may still be
 * loading: the box follows them until something is typed in it.
 * @param {HTMLTextAreaElement|HTMLInputElement} input
 * @param {string} text the text as the rule holds it
 * @param {object|string} [translations] the rule's own translations of it
 */
Rules.prototype.showRuleText = function(input, text, translations) {
  if (!input) return;
  const locale = Rules.uiLocale();
  const map = Rules.parseTextMap(translations);
  // A late answer of an earlier call (another rule opened since) must not write into this one
  const token = (input._ruleTextToken || 0) + 1;
  input._ruleTextToken = token;
  input.dataset.originalText = text || '';
  input.dataset.originalI18n = JSON.stringify(map);
  input.dataset.edited = '';
  const show = () => {
    if (input._ruleTextToken !== token || input.dataset.edited) return;
    input.value = Rules.shownText(text, map, locale);
    input.dataset.shown = ruleTextClean(input.value);
  };
  show();
  if (locale && typeof RuleI18n !== 'undefined') RuleI18n.load(locale).then(show).catch(() => {});
};

/**
 * The text of a box and the translations that go with it: what the rule held when the box was left as it was shown,
 * else what was typed, with no translations (they translate the text that was replaced).
 * @returns {{text: string, translations: object, changed: boolean}}
 */
Rules.collectRuleText = function(input) {
  const typed = ruleTextClean(input && input.value);
  if (!input || !('shown' in input.dataset) || typed === input.dataset.shown) {
    return { text: input?.dataset.originalText ?? typed, translations: Rules.parseTextMap(input?.dataset.originalI18n), changed: false };
  }
  return { text: typed, translations: {}, changed: true };
};

/** Fill Detector Information → Description from a detector. */
Rules.prototype.renderDetectorDescription = function(detector) {
  const input = document.querySelector('#detectorDescriptionInput');
  if (!input) return;
  const description = typeof detector?.description === 'string' ? detector.description : '';
  input.maxLength = Math.max(RULE_TEXT_MAX, description.length);
  this.showRuleText(input, description, detector?.descriptionI18n);
};

/**
 * The description to save and its translations; translations belong to the text they translate, so there are none
 * without a description.
 * @returns {{description: string, descriptionI18n: object}}
 */
Rules.prototype.collectDetectorDescription = function() {
  const { text, translations } = Rules.collectRuleText(document.querySelector('#detectorDescriptionInput'));
  const description = ruleTextClean(text);
  return { description, descriptionI18n: description ? translations : {} };
};

// A box that was typed in no longer follows the translations that finish loading (one listener: the boxes are reused)
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('input', (event) => {
    const box = event.target;
    if (box && box.dataset && 'originalText' in box.dataset) box.dataset.edited = '1';
  });
}
