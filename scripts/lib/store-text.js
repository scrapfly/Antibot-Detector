// What a Chrome Web Store listing (store/listing/<code>.txt) and the copy of its images
// (store/captions/<code>.json) must satisfy. Pure functions, shared by
// scripts/check-store-listing.js and test/store-listing.test.js.
//
// The rules come from the store's own: the description is plain text (the store renders no
// Markdown), "unnatural repetition of the same keyword more than 5 times" and lists of
// brands or keywords are keyword spam, the listing must not promise other features than the
// English one does (the dashboard warns about inconsistent metadata), and the details must
// be accurate. The rest keeps every language the same text, translated.

const { SCRIPT, NOT_USED } = require('./locale-rules.js');

const MAX_LISTING = 16000; // characters of the detailed description
const HOOK_MAX = 250; // the first paragraph is what the store shows first
const KEY_TERM_MAX = 5;
const LENGTH_RATIO = { min: 0.3, max: 1.9 }; // of the English text (CJK is much shorter)
const SCREENS = ['detection', 'history', 'rules', 'advanced', 'settings'];

// The UI names the description uses to point at the tabs and the statistics page, spelled as
// the language's own extension spells them (a visitor must find them in the popup).
const UI_LABEL_KEYS = ['tabDetection', 'tabHistory', 'tabRules', 'tabAdvanced', 'settingsTitle', 'settingsTabData', 'settingsOpenStats', 'settingsHistoryStatsTitle'];
const TERM_KEYS = ['categoryAntibot', 'categoryCaptcha', 'categoryFingerprint'];

// Code points allowed in the image copy: [headline, subtitle, chip, two neighbouring chips together].
// The text sits in a column about 250px wide (the headline 27px bold in at most 3 lines, the chips 11px
// monospace in at most 2 rows), so the headline and the chips are guardrails and the generator's layout check
// (scripts/lib/store-art.js) is the final judge. The chips are exact enough to state: a Latin, Cyrillic or
// Vietnamese letter takes 6.6px (IBM Plex Mono), a Korean, Japanese or Chinese one 11px, a chip adds 20px of
// padding and the gap is 7px, so two chips share a 250px row up to 30 and 18 characters. Chips wrap in order,
// so three chips take two rows only when the first two, or the last two, share a row.
const BUDGETS = {
    latin: [48, 150, 22, 30],
    narrow: [40, 120, 20, 40], // Arabic, Hindi, Thai: marks that take no width still count as characters
    korean: [24, 80, 12, 18],
    han: [20, 64, 12, 18] // Japanese, Chinese
};
const BUDGET_OF = { ar: 'narrow', hi: 'narrow', th: 'narrow', ko: 'korean', ja: 'han', zh_CN: 'han', zh_TW: 'han' };
const NOTE_MAX = 30; // the demo History note

// Share of a text's letters that must be in the language's own script (Latin languages: Latin letters)
const SCRIPT_SHARE = 0.55;
const LATIN_SHARE = 0.9;

const codePoints = (text) => [...String(text)].length;

// Digits of other scripts written as ASCII, so "٧٠" and "70" count as the same number
function asciiDigits(text) {
    return String(text)
        .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
        .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966))
        .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0E50));
}

const numbersIn = (text) => (asciiDigits(text).match(/\d+/g) || []).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

// Blocks are separated by blank lines; their lines are never wrapped by hand
const blocksOf = (text) => String(text).replace(/\n+$/, '').split(/\n{2,}/).map((block) => block.split('\n'));
const signatureOf = (text) => blocksOf(text).map((lines) => `${lines.length}:${lines.filter((line) => line.startsWith('• ')).length}`).join(' ');

function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
    return count;
}

function scriptShare(text, code) {
    const letters = [...text].filter((char) => /\p{L}/u.test(char));
    if (!letters.length) return 0;
    const own = SCRIPT[code]
        ? letters.filter((char) => SCRIPT[code].test(char))
        : letters.filter((char) => /\p{Script=Latin}/u.test(char));
    return own.length / letters.length;
}

// What both the description and the image copy must not contain
function commonProblems(label, text, code) {
    const problems = [];
    if (/[<>]/.test(text)) problems.push(`${label}: contains < or > (no HTML)`);
    if (/https?:\/\/|www\./i.test(text)) problems.push(`${label}: contains a web address (the store treats it as spam in a description)`);
    if (/\p{Extended_Pictographic}/u.test(text)) problems.push(`${label}: contains an emoji`);
    if (/\{\d\}|TODO|�/.test(text)) problems.push(`${label}: contains a placeholder, TODO or a broken character`);
    if (NOT_USED[code] && NOT_USED[code].test(text)) problems.push(`${label}: contains letters of the wrong variant of the language`);
    const share = scriptShare(text, code);
    const need = SCRIPT[code] ? SCRIPT_SHARE : LATIN_SHARE;
    if (share < need) problems.push(`${label}: only ${Math.round(share * 100)}% of the letters are in the language's script (${Math.round(need * 100)}% needed)`);
    return problems;
}

/**
 * @param {string} code  language code, as the _locales folder
 * @param {string} text  the file's content
 * @param {{english: string, messages: object}} context  the English listing and this language's _locales messages
 * @returns {string[]} problems; empty when it passes
 */
function checkListing(code, text, { english, messages }) {
    const problems = [];
    const at = (rule) => `${code}: ${rule}`;
    if (text.charCodeAt(0) === 0xFEFF) problems.push(at('starts with a byte order mark'));
    if (/\r/.test(text)) problems.push(at('has Windows line endings (use LF)'));
    if (/\t/.test(text)) problems.push(at('contains a tab'));
    if (/[  ]+$/m.test(text)) problems.push(at('has spaces at the end of a line'));
    if (/\n{3,}/.test(text)) problems.push(at('has more than one blank line in a row'));
    if (!/[^\n]\n$/.test(text)) problems.push(at('must end with exactly one newline'));
    if (/^#{1,6}\s/m.test(text) || /\*\*|__|`|\]\(/.test(text)) problems.push(at('contains Markdown (the store shows plain text)'));
    if (/^[-*+]\s/m.test(text)) problems.push(at('bullets must be "• " (a dash or star is not one)'));
    if (/^\s*\p{Lu}[\p{Lu}\s]{8,}$/mu.test(text)) problems.push(at('has a line in capital letters'));

    const chars = codePoints(text);
    const englishChars = codePoints(english);
    if (chars > MAX_LISTING) problems.push(at(`has ${chars} characters (${MAX_LISTING} at most)`));
    if (chars < englishChars * LENGTH_RATIO.min) problems.push(at(`has ${chars} characters, far shorter than the English ${englishChars}`));
    if (chars > englishChars * LENGTH_RATIO.max) problems.push(at(`has ${chars} characters, far longer than the English ${englishChars}`));

    if (signatureOf(text) !== signatureOf(english)) {
        problems.push(at(`has the blocks "${signatureOf(text)}" but the English text has "${signatureOf(english)}" (same sections, same bullets, one line per paragraph; format: lines:bullets)`));
    }
    const hook = blocksOf(text)[0][0] || '';
    if (codePoints(hook) > HOOK_MAX) problems.push(at(`the first paragraph has ${codePoints(hook)} characters (${HOOK_MAX} at most)`));
    // Thai sentences end without a full stop (the extension's own Thai texts do not use one either)
    if (code !== 'th' && !/[.!?。！？।؟…]$/.test(hook)) problems.push(at('the first paragraph must end with sentence punctuation'));

    const got = numbersIn(text).join(',');
    const want = numbersIn(english).join(',');
    if (got !== want) problems.push(at(`numbers are [${got}] but the English text has [${want}]`));

    const lower = text.toLowerCase();
    for (const key of UI_LABEL_KEYS) {
        const label = messages[key] && messages[key].message;
        if (!label) problems.push(at(`_locales has no ${key}`));
        else if (!lower.includes(label.toLowerCase())) problems.push(at(`does not use the extension's own word "${label}" (${key})`));
    }
    for (const key of TERM_KEYS) {
        const term = messages[key] && messages[key].message && messages[key].message.toLowerCase();
        const count = countOccurrences(lower, term);
        if (count > KEY_TERM_MAX) problems.push(at(`"${term}" appears ${count} times (${KEY_TERM_MAX} at most: the store treats more as keyword spam)`));
    }
    const brand = countOccurrences(lower, 'scrapfly');
    if (brand > KEY_TERM_MAX) problems.push(at(`"Scrapfly" appears ${brand} times (${KEY_TERM_MAX} at most)`));

    problems.push(...commonProblems(code, text, code));
    return problems;
}

/**
 * @param {string} code
 * @param {object} captions  the parsed store/captions/<code>.json
 * @param {{english: object}} context  the parsed English captions
 */
function checkCaptions(code, captions, { english }) {
    const problems = [];
    const at = (rule) => `${code} captions: ${rule}`;
    if (!captions || typeof captions !== 'object') return [at('is not a JSON object')];
    if (captions.language !== code) problems.push(at(`"language" is "${captions.language}", expected "${code}"`));
    const [headlineMax, subtitleMax, chipMax, chipPairMax] = BUDGETS[BUDGET_OF[code] || 'latin'];
    const allText = [];

    for (const screen of SCREENS) {
        const copy = captions.screens && captions.screens[screen];
        const reference = english.screens[screen];
        if (!copy) { problems.push(at(`screens.${screen} is missing`)); continue; }
        for (const field of ['before', 'highlight', 'after', 'subtitle']) {
            if (typeof copy[field] !== 'string') problems.push(at(`screens.${screen}.${field} must be text`));
        }
        if (!copy.highlight || !copy.subtitle) { problems.push(at(`screens.${screen} needs a highlight and a subtitle`)); continue; }
        const headline = `${copy.before || ''} ${copy.highlight} ${copy.after || ''}`.trim();
        if (codePoints(headline) > headlineMax) problems.push(at(`screens.${screen} headline has ${codePoints(headline)} characters (${headlineMax} at most)`));
        if (codePoints(copy.subtitle) > subtitleMax) problems.push(at(`screens.${screen} subtitle has ${codePoints(copy.subtitle)} characters (${subtitleMax} at most)`));
        allText.push(headline, copy.subtitle);

        if (reference.chips === 'categories') {
            if (copy.chips !== 'categories') problems.push(at(`screens.${screen}.chips must be "categories" (the language's own category names)`));
        } else if (!Array.isArray(copy.chips) || copy.chips.length !== reference.chips.length) {
            problems.push(at(`screens.${screen}.chips must be a list of ${reference.chips.length} short texts`));
        } else {
            for (const chip of copy.chips) {
                if (typeof chip !== 'string' || !chip.trim()) problems.push(at(`screens.${screen} has an empty chip`));
                else if (codePoints(chip) > chipMax) problems.push(at(`screens.${screen} chip "${chip}" has ${codePoints(chip)} characters (${chipMax} at most)`));
                else allText.push(chip);
            }
            const lengths = copy.chips.filter((chip) => typeof chip === 'string').map(codePoints);
            const pairs = lengths.slice(1).map((length, index) => lengths[index] + length);
            if (pairs.length >= 2 && Math.min(...pairs) > chipPairMax) {
                problems.push(at(`screens.${screen} chips do not fit in two rows: chips 1+2 have ${pairs[0]} characters and chips 2+3 have ${pairs[1]}, and one of the two pairs must have ${chipPairMax} at most`));
            }
        }
    }

    const demo = captions.demo || {};
    if (typeof demo.note !== 'string' || !demo.note.trim()) problems.push(at('demo.note is missing'));
    else if (codePoints(demo.note) > NOTE_MAX) problems.push(at(`demo.note has ${codePoints(demo.note)} characters (${NOTE_MAX} at most)`));
    else allText.push(demo.note);
    if (typeof demo.detected !== 'string' || !demo.detected.includes('{0}')) problems.push(at('demo.detected must contain {0} (the number)'));
    else allText.push(demo.detected.replace('{0}', ''));

    if (allText.length) problems.push(...commonProblems(at('text'), allText.join('\n'), code));
    return problems;
}

module.exports = {
    MAX_LISTING, HOOK_MAX, KEY_TERM_MAX, SCREENS, UI_LABEL_KEYS, TERM_KEYS, BUDGETS, BUDGET_OF, NOTE_MAX,
    codePoints, asciiDigits, numbersIn, blocksOf, signatureOf, countOccurrences, scriptShare,
    checkListing, checkCaptions
};
