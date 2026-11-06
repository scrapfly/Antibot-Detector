/**
 * Pattern Cache Utility
 * High-performance caching for compiled regex patterns and match results
 */

/**
 * Simple hash function for cache keys
 * @param {string} str - String to hash
 * @returns {string} - Base36 hash
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36); // Base36 for shorter keys
}

/** A second, unrelated 32-bit hash (FNV-1a): a text's cache key holds both, so one collision is not enough */
function fnv1aHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

/**
 * A rough reading of a regex source for the ReDoS check: atoms with the characters they can start with and
 * their quantifier, groups with their branches. Anything it does not understand reads as "any character",
 * which only makes the check stricter.
 */
const REDOS_ASCII = 128;
// This many unbounded repeats in a row over the same characters read as polynomial backtracking
const REDOS_MAX_ADJACENT_REPEATS = 3;
// A group repeated a limited number of times that can split the same text in more than one way: the rounds of all such groups
// in a pattern are added up (nested ones multiply) and may come to this many. (a|a?){4}b is 81 ways at every position of a
// text, 36 ms over 100,000 characters; (a|a?){6}b takes 300 ms there, (a|a?){16}b is 3^16 ways to read 16 characters
const REDOS_MAX_AMBIGUOUS_ROUNDS = 4;

function redosSet(all = false) {
    return { ascii: new Array(REDOS_ASCII).fill(all), other: all };
}

function redosAddChar(set, code) {
    if (code >= REDOS_ASCII) { set.other = true; return; }
    set.ascii[code] = true;
    // Detector regexes are mostly compiled case-insensitively: a letter overlaps both of its cases
    const ch = String.fromCharCode(code);
    const lower = ch.toLowerCase().charCodeAt(0), upper = ch.toUpperCase().charCodeAt(0);
    if (lower < REDOS_ASCII) set.ascii[lower] = true;
    if (upper < REDOS_ASCII) set.ascii[upper] = true;
}

function redosAddRange(set, from, to) {
    for (let code = from; code <= to; code++) {
        if (code >= REDOS_ASCII) { set.other = true; break; }
        redosAddChar(set, code);
    }
}

function redosUnion(into, set) {
    for (let i = 0; i < REDOS_ASCII; i++) if (set.ascii[i]) into.ascii[i] = true;
    if (set.other) into.other = true;
    return into;
}

function redosOverlap(a, b) {
    if (a.other && b.other) return true;
    for (let i = 0; i < REDOS_ASCII; i++) if (a.ascii[i] && b.ascii[i]) return true;
    return false;
}

/** The set of a class escape (\d \w \s), or null for any other escape. */
function redosClassEscape(c) {
    const set = redosSet();
    if (c === 'd') { redosAddRange(set, 48, 57); return set; }
    if (c === 'w') { redosAddRange(set, 48, 57); redosAddRange(set, 65, 90); redosAddRange(set, 97, 122); redosAddChar(set, 95); return set; }
    if (c === 's') { [9, 10, 11, 12, 13, 32].forEach(code => redosAddChar(set, code)); set.other = true; return set; }
    if (c === 'D' || c === 'W' || c === 'S') return redosSet(true);
    return null;
}

const REDOS_CONTROL_ESCAPES = { n: 10, r: 13, t: 9, f: 12, v: 11, '0': 0 };

/** Parses source into a tree; throws on what it cannot follow (the caller then falls back). */
function redosParse(source) {
    let pos = 0;

    function parseEscapeAt(set) {
        // pos is on the character after the backslash
        const c = source[pos];
        if (c === undefined) throw new Error('trailing backslash');
        pos++;
        const cls = redosClassEscape(c);
        if (cls) return redosUnion(set, cls);
        if (c in REDOS_CONTROL_ESCAPES) { redosAddChar(set, REDOS_CONTROL_ESCAPES[c]); return set; }
        if (/[1-9xucpPk]/.test(c)) return redosUnion(set, redosSet(true)); // backreferences, code points, properties
        redosAddChar(set, c.charCodeAt(0));
        return set;
    }

    function parseClass() {
        // pos is after '['
        const set = redosSet();
        let negated = false;
        // Whether the set is exactly the characters the class lists (an escape the reading does not follow counts as any character)
        let exact = true;
        if (source[pos] === '^') { negated = true; pos++; }
        while (pos < source.length && source[pos] !== ']') {
            let code = null;
            if (source[pos] === '\\') {
                pos++;
                const c = source[pos];
                const cls = c !== undefined ? redosClassEscape(c) : null;
                if (cls) { pos++; redosUnion(set, cls); if (c === 'D' || c === 'W' || c === 'S') exact = false; continue; }
                if (c in REDOS_CONTROL_ESCAPES) { pos++; code = REDOS_CONTROL_ESCAPES[c]; }
                else if (c !== undefined && /[xucpPb]/.test(c)) { pos++; redosUnion(set, redosSet(true)); exact = false; continue; }
                else if (c === undefined) throw new Error('trailing backslash');
                else { pos++; code = c.charCodeAt(0); }
            } else {
                code = source.charCodeAt(pos);
                pos++;
            }
            if (source[pos] === '-' && source[pos + 1] !== undefined && source[pos + 1] !== ']') {
                pos++;
                let to;
                if (source[pos] === '\\') {
                    const c = source[pos + 1];
                    if (c === undefined || redosClassEscape(c) || /[xucpP]/.test(c)) { pos += 2; redosUnion(set, redosSet(true)); exact = false; continue; }
                    to = c in REDOS_CONTROL_ESCAPES ? REDOS_CONTROL_ESCAPES[c] : c.charCodeAt(0);
                    pos += 2;
                } else {
                    to = source.charCodeAt(pos);
                    pos++;
                }
                redosAddRange(set, code, to);
                continue;
            }
            redosAddChar(set, code);
        }
        if (source[pos] !== ']') throw new Error('unclosed class');
        pos++;
        if (!negated) return set;
        // [^&] is every character but &: a round that ends at & splits the text one way, which "any character" would hide. Only
        // for a class of characters with no case (punctuation, digits, spaces): a letter overlaps both of its cases in the set
        // (the patterns are mostly compiled case-insensitively), and the leftover of that would be too small. Anything else stays "any".
        if (!exact || set.ascii.some((listed, code) => listed && /[A-Za-z]/.test(String.fromCharCode(code)))) return redosSet(true);
        const left = redosSet(true);
        for (let code = 0; code < REDOS_ASCII; code++) if (set.ascii[code]) left.ascii[code] = false;
        return left;
    }

    function parseQuantifier(atom) {
        const c = source[pos];
        if (c === '*' || c === '+' || c === '?') {
            pos++;
            atom.quant = c === '?' ? 'optional' : 'unbounded';
            atom.nullable = atom.nullable || c !== '+';
            atom.min = c === '+' ? 1 : 0;
            atom.most = c === '?' ? 1 : Infinity;
        } else if (c === '{') {
            const m = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(pos));
            if (!m) return; // a literal brace
            pos += m[0].length;
            const min = Number(m[1]);
            const unbounded = m[2] !== undefined && m[3] === '';
            atom.quant = unbounded ? 'unbounded' : 'bounded';
            // {10} and {1,10} run the group's rounds one after another as + does, only for a bounded number of them: (a+){10}b
            // takes as long as (a+)+b on a text of the same kind
            const most = unbounded ? Infinity : (m[2] !== undefined ? Number(m[3]) : min);
            atom.min = min;
            atom.most = most;
            if (most >= 2) atom.rounds = true;
            if (min === 0) atom.nullable = true;
        } else {
            return;
        }
        if (source[pos] === '?') pos++; // lazy
    }

    function parseAtom() {
        const c = source[pos];
        let atom;
        if (c === '(') {
            pos++;
            let zeroWidth = false;
            if (source[pos] === '?') {
                const rest = source.slice(pos);
                if (rest.startsWith('?:')) pos += 2;
                else if (rest.startsWith('?=') || rest.startsWith('?!')) { pos += 2; zeroWidth = true; }
                else if (rest.startsWith('?<=') || rest.startsWith('?<!')) { pos += 3; zeroWidth = true; }
                else if (rest.startsWith('?<')) { const end = source.indexOf('>', pos); if (end === -1) throw new Error('bad group name'); pos = end + 1; }
                else throw new Error('unknown group');
            }
            const branches = parseAlternatives();
            if (source[pos] !== ')') throw new Error('unclosed group');
            pos++;
            const first = redosSet();
            let nullable = false;
            for (const branch of branches) { redosUnion(first, branch.first); if (branch.nullable) nullable = true; }
            atom = zeroWidth
                ? { kind: 'zero', first: redosSet(), nullable: true, branches }
                : { kind: 'group', first, nullable, branches };
        } else if (c === '[') {
            pos++;
            atom = { kind: 'char', first: parseClass(), nullable: false };
        } else if (c === '\\') {
            pos++;
            if (source[pos] === 'b' || source[pos] === 'B') { pos++; atom = { kind: 'zero', first: redosSet(), nullable: true }; }
            else atom = { kind: 'char', first: parseEscapeAt(redosSet()), nullable: false };
        } else if (c === '^' || c === '$') {
            pos++;
            atom = { kind: 'zero', first: redosSet(), nullable: true };
        } else if (c === '.') {
            pos++;
            atom = { kind: 'char', first: redosSet(true), nullable: false };
        } else {
            const set = redosSet();
            redosAddChar(set, source.charCodeAt(pos));
            pos++;
            atom = { kind: 'char', first: set, nullable: false };
        }
        atom.quant = null;
        parseQuantifier(atom);
        return atom;
    }

    function parseSequence() {
        const atoms = [];
        while (pos < source.length && source[pos] !== '|' && source[pos] !== ')') atoms.push(parseAtom());
        const first = redosSet();
        let nullable = true;
        for (const atom of atoms) {
            if (atom.kind === 'zero') continue;
            redosUnion(first, atom.first);
            if (!atom.nullable) { nullable = false; break; }
        }
        return { atoms, first, nullable };
    }

    function parseAlternatives() {
        const branches = [parseSequence()];
        while (source[pos] === '|') { pos++; branches.push(parseSequence()); }
        return branches;
    }

    const branches = parseAlternatives();
    if (pos !== source.length) throw new Error('unbalanced');
    return branches;
}

/** Can the atom match more than one length? Any repeat but a fixed {n}: a?, \d{1,3}, a*. */
function redosVariable(atom) {
    return atom.most !== undefined && atom.most > atom.min;
}

/**
 * A repeated group that can split the same text in more than one way. An unbounded one backtracks exponentially:
 * refused at once. A bounded one has a limited number of rounds, and a few ways over a few rounds are cheap, so its
 * rounds are added up for the whole pattern (the rounds of the groups it sits in multiply them) and the pattern is
 * refused over REDOS_MAX_AMBIGUOUS_ROUNDS.
 * @param {{most: number, weight: number, counted: boolean}} group - the repeated group: its most rounds, the rounds of the groups around it
 * @param {{used: number}} budget - the rounds counted so far in this pattern
 * @returns {boolean} true when the pattern is to be refused
 */
function redosAmbiguity(group, budget) {
    if (group.most === Infinity) return true;
    if (!group.counted) {
        group.counted = true;
        budget.used += group.most * group.weight;
    }
    return budget.used > REDOS_MAX_AMBIGUOUS_ROUNDS;
}

/**
 * Whether a repeated group in the tree can match the same text in many ways (exponential backtracking):
 * - a repeated choice whose branches can start alike, or match nothing: (a|aa)+, (\w|\d)+, (a|)+, (a|a?){16}
 * - a repeat inside a repeat that can run into the next round: (a+)+, (a+a)+, (\d*)*, and the same with a repeat of
 *   limited length, (\d{1,3}){1,14}, (a?){20}. One that a required character it cannot match ends, as in host names
 *   (?:[a-z0-9-]*[a-z0-9]\.)* or addresses (\d{1,3}\.){3}, splits the text one way only.
 * Over an unbounded repeat either is refused at once; over a bounded one the rounds are counted (redosAmbiguity).
 * @param {Array} branches - redosParse() output
 * @param {{rest: Array, boundary: ?Object, group: ?Object, weight: number, budget: {used: number}}} [scope] - the required
 *        character sets after this point in the round of the nearest repeated group, what that group's next round starts
 *        with, that group (redosAmbiguity), the rounds of the groups around this point, and the pattern's rounds so far
 */
function redosTreeIsEvil(branches, scope = { rest: [], boundary: null, group: null, weight: 1, budget: { used: 0 } }) {
    for (const branch of branches) {
        // Adjacent unbounded atoms that can match the same characters split a run of them any way they like: n^k
        // steps for k of them (a*a*a*a*b, .*.*.*x). Two are quadratic and common (.*.*); three or more are refused.
        let run = 0;
        for (let index = 0; index < branch.atoms.length; index++) {
            const atom = branch.atoms[index];
            const unbounded = atom.quant === 'unbounded';
            if (unbounded && atom.kind !== 'zero') {
                const before = index > 0 ? branch.atoms[index - 1] : null;
                const joined = before && before.quant === 'unbounded' && before.kind !== 'zero' && redosOverlap(before.first, atom.first);
                run = joined ? run + 1 : 1;
                if (run >= REDOS_MAX_ADJACENT_REPEATS) return true;
            } else {
                run = 0;
            }
            const rest = branch.atoms.slice(index + 1)
                .filter(next => next.kind !== 'zero' && !next.nullable)
                .map(next => next.first)
                .concat(scope.rest);
            if (scope.boundary && atom.kind !== 'zero' && redosVariable(atom)) {
                const separated = rest.some(set => !redosOverlap(set, atom.first));
                if (!separated && redosOverlap(atom.first, scope.boundary) && (unbounded || redosAmbiguity(scope.group, scope.budget))) return true;
            }
            if (!atom.branches) continue;
            const repeated = atom.kind === 'group' && (unbounded || atom.rounds);
            // This group as the repeated group of the checks inside it: how many rounds it has, and how many the groups around it
            const own = repeated ? { most: atom.most, weight: scope.weight, counted: false } : null;
            if (repeated && atom.branches.length > 1) {
                let alike = atom.branches.some(b => b.nullable);
                for (let i = 0; i < atom.branches.length && !alike; i++) {
                    for (let j = i + 1; j < atom.branches.length && !alike; j++) {
                        alike = redosOverlap(atom.branches[i].first, atom.branches[j].first);
                    }
                }
                if (alike && redosAmbiguity(own, scope.budget)) return true;
            }
            const inner = repeated
                ? { rest: [], boundary: atom.first, group: own, weight: scope.weight * atom.most, budget: scope.budget }
                : { rest, boundary: scope.boundary, group: scope.group, weight: scope.weight, budget: scope.budget };
            if (redosTreeIsEvil(atom.branches, inner)) return true;
        }
    }
    return false;
}

/**
 * Heuristic ReDoS check — rejects patterns most likely to cause catastrophic
 * backtracking. Conservative: prefers false positives (over-rejection) to a
 * hung extension. Catches `(a+)+`, `(a*)*`, `(\d+)+`, `(a{2,})+`, nested ones
 * such as `((a+)+b)+`, and repeated choices whose branches overlap, such as
 * `(a|aa)+` and `(\w|\d)+`; and the same inside a group repeated a number of
 * times, `(a|a?){16}` and `(\d{1,3}){1,14}` (redosTreeIsEvil).
 * It does not mind a single wildcard between literals (`function.*zzz`): that one is slow only on a very long
 * text, which PatternCache.REGEX_TEXT_LIMIT bounds for rules that are not official.
 * @param {string} pattern - User-supplied regex source
 * @returns {boolean} true if the pattern looks dangerous
 */
function isLikelyEvilRegex(pattern) {
    if (typeof pattern !== 'string') return false;
    if (pattern.length > 1000) return true;
    try {
        // The reading of the pattern decides: it tells ([a-z0-9]+\.)+ (the dot splits the text one way only) from (a+)+
        return redosTreeIsEvil(redosParse(pattern));
    } catch (_) {
        // A source the reading does not follow (an invalid one never compiles): the cruder checks decide, and prefer to refuse.
        // A group containing + * or {n,} immediately followed by another + or *
        return /\([^()]*[+*][^()]*\)\s*[+*]/.test(pattern) || /\([^()]*\{\d+,\}[^()]*\)\s*[+*]/.test(pattern);
    }
}

/**
 * A regular expression the detection engine compiles and runs: it is valid, and the check above does not refuse it. The
 * rule editor's Save and a rule file's import both ask this, so a rule that is saved is one that matches and one that
 * is imported is one that matches.
 * @param {string} pattern - Regex source
 * @returns {boolean}
 */
function isRunnableRegex(pattern) {
    if (typeof pattern !== 'string') return false;
    try { new RegExp(pattern); } catch (_) { return false; }
    return !isLikelyEvilRegex(pattern);
}

/**
 * PatternCache - High-performance caching for compiled regex patterns and match results
 * Uses LRU eviction strategy to limit memory usage
 * Eliminates 60-80% of regex compilation overhead
 */
class PatternCache {
    constructor(maxSize = Constants.PATTERN_CACHE_MAX_SIZE) {
        this.maxSize = maxSize;
        // Cache for compiled regex patterns: key -> {regex, timestamp}
        this.regexCache = new Map();
        // Cache for match results: key -> {result, timestamp}
        this.matchCache = new Map();
        // FIFO queue for O(1) eviction
        this.insertionOrder = [];
    }

    /**
     * Generate cache key from pattern and options
     */
    getCacheKey(pattern, options = {}) {
        // The pattern's length first: a pattern holding "|" cannot read as a shorter pattern and its options
        const text = String(pattern);
        return `${text.length}:${text}|${options.regex}|${options.wholeWord}|${options.caseSensitive}`;
    }

    /**
     * Get or compile regex pattern
     */
    getCompiledPattern(pattern, options = {}) {
        const key = this.getCacheKey(pattern, options);

        if (this.regexCache.has(key)) {
            return this.regexCache.get(key).regex;
        }

        // Compile and cache
        let compiledRegex = null;
        try {
            if (options.regex) {
                if (isLikelyEvilRegex(pattern)) {
                    if (typeof Logger !== 'undefined' && Logger.warn) {
                        Logger.warn('DETECTION', '[PatternCache] Rejecting potentially dangerous regex (ReDoS risk):', pattern);
                    }
                    return null;
                }
                // Non-global: these compiled regexes are cached and reused across
                // many texts with .test(); a 'g' flag makes lastIndex persist and
                // produces intermittent false negatives. .test()/.match()[0] don't
                // need the global flag.
                const flags = options.caseSensitive ? '' : 'i';
                compiledRegex = new RegExp(pattern, flags);
            } else if (options.wholeWord) {
                const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                compiledRegex = new RegExp(`\\b${escapedPattern}\\b`, options.caseSensitive ? '' : 'i');
            }
        } catch (e) {
            return null;
        }

        // Cache and evict if needed
        this.regexCache.set(key, { regex: compiledRegex, timestamp: Date.now() });
        this.insertionOrder.push(key);
        this.evictIfNeeded();

        return compiledRegex;
    }

    /**
     * The part of a text that a rule's own regular expression reads: its first REGEX_TEXT_LIMIT characters. A repeat such as
     * `.*` between two literals takes time that grows with the square of a single-line text (a minified bundle), and a
     * synchronous match in the worker cannot be stopped. Rules shipped by Scrapfly read the whole text (the caller says which).
     * @param {string} text
     * @returns {string}
     */
    textForRegex(text) {
        return text.length > PatternCache.REGEX_TEXT_LIMIT ? text.slice(0, PatternCache.REGEX_TEXT_LIMIT) : text;
    }

    /**
     * The key a text's match results are cached under, or null when the text is not cached at all: hashing a
     * long text (a whole page's HTML) for every pattern cost more than the match it would save, and the entry
     * was rarely hit again.
     */
    textKeyFor(text) {
        if (text.length > PatternCache.MATCH_CACHE_MAX_TEXT) return null;
        // A long text is keyed by its length and two hashes of all of it (not truncated); the leading control character
        // keeps that key apart from a short text that happens to look like it
        return text.length > 100 ? `\u0001${text.length}:${simpleHash(text)}.${fnv1aHash(text)}` : text;
    }

    /**
     * Check if match result is cached
     */
    getCachedMatch(text, pattern, options, textKey) {
        const textHash = textKey !== undefined ? textKey : this.textKeyFor(text);
        if (textHash === null) return { found: false };
        const matchKey = `${textHash === text ? 's' : 'h'}${textHash.length}:${textHash}|${this.getCacheKey(pattern, options)}`; // the kind of key and its length first: where the text ends is never a guess

        if (this.matchCache.has(matchKey)) {
            const cached = this.matchCache.get(matchKey);
            if (Date.now() - cached.timestamp < Constants.MATCH_CACHE_TTL) {
                return { found: true, result: cached.result };
            }
            // Expired, remove
            this.matchCache.delete(matchKey);
        }
        return { found: false };
    }

    /**
     * Cache a match result
     */
    cacheMatch(text, pattern, options, result, textKey) {
        const textHash = textKey !== undefined ? textKey : this.textKeyFor(text);
        if (textHash === null) return;
        const matchKey = `${textHash === text ? 's' : 'h'}${textHash.length}:${textHash}|${this.getCacheKey(pattern, options)}`; // the kind of key and its length first: where the text ends is never a guess
        this.matchCache.set(matchKey, { result, timestamp: Date.now() });
        this.insertionOrder.push(matchKey);
        this.evictIfNeeded();
    }

    /**
     * Evict oldest entries if cache is full
     * Uses FIFO (First-In-First-Out) for O(1) eviction
     */
    evictIfNeeded() {
        const totalSize = this.regexCache.size + this.matchCache.size;
        if (totalSize > this.maxSize) {
            // Simple FIFO: evict oldest 10% from front of queue
            const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
            for (let i = 0; i < evictCount && this.insertionOrder.length > 0; i++) {
                const oldestKey = this.insertionOrder.shift();
                this.regexCache.delete(oldestKey);
                this.matchCache.delete(oldestKey);
            }
        }
    }

    /**
     * Clear all caches
     */
    clear() {
        this.regexCache.clear();
        this.matchCache.clear();
        this.insertionOrder = [];
    }
}

// Texts longer than this (in characters) are matched without the result cache
PatternCache.MATCH_CACHE_MAX_TEXT = 4096;

// A regular expression of a rule that is not an official one reads this many characters of a text at most (see textForRegex):
// `function.*zzz` over one 100,000-character line takes about 130 ms, over 250,000 about 0.8 s, and over a 3 MB bundle a minute or more
PatternCache.REGEX_TEXT_LIMIT = 100000;

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = { PatternCache, isLikelyEvilRegex, isRunnableRegex, simpleHash }; }
