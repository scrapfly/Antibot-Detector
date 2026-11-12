/**
 * DetectionUtils - Detection confidence scoring and difficulty analysis
 */
// The detection categories are described once, in modules/core/categories.js (the popup and the worker load it first)
if (typeof Categories === 'undefined' && typeof module !== 'undefined' && typeof require === 'function') {
  globalThis.Categories = require('../modules/core/categories.js');
}
class DetectionUtils {

  /**
   * Author name reserved for the detectors Scrapfly ships with the extension.
   */
  static OFFICIAL_AUTHOR = 'Scrapfly';

  /**
   * IDs of the detectors bundled in detectors/index.json. Filled once by
   * DetectorManager.loadOfficialDetectorIds(); empty until then, which makes
   * every detector non-official (fail closed).
   * @type {Set<string>}
   */
  static _officialDetectorIds = new Set();

  /**
   * Register the IDs of the bundled (shipped) detectors.
   * @param {Iterable<string>} ids
   */
  static setOfficialDetectorIds(ids) {
    DetectionUtils._officialDetectorIds = new Set(
      Array.from(ids || []).filter(id => typeof id === 'string' && id)
    );
  }

  /**
   * True when an author string claims the reserved "Scrapfly" name
   * (case-insensitive, surrounding whitespace ignored).
   * @param {string} author
   * @returns {boolean}
   */
  static isReservedAuthor(author) {
    if (typeof author !== 'string') return false;
    return author.trim().toLowerCase() === DetectionUtils.OFFICIAL_AUTHOR.toLowerCase();
  }

  /** Category order of the Detection list (Settings → Detection → Category order) */
  static DEFAULT_CATEGORY_ORDER = [...Categories.KEYS];

  /**
   * A saved category order as a complete order of the three categories:
   * unknown or repeated entries are dropped and missing categories are
   * appended in their default position.
   * @param {Array<string>|string} order - array, or comma-separated string
   * @returns {string[]}
   */
  static normalizeCategoryOrder(order) {
    const list = Array.isArray(order) ? order : String(order || '').split(',');
    const known = DetectionUtils.DEFAULT_CATEGORY_ORDER;
    const out = [];
    for (const raw of list) {
      const category = Categories.keyOf(String(raw || '').trim());
      if (known.includes(category) && !out.includes(category)) out.push(category);
    }
    for (const category of known) if (!out.includes(category)) out.push(category);
    return out;
  }

  /** Settings → "Show first": highest confidence instead of a category order */
  static SORT_BY_CONFIDENCE = 'confidence';

  /**
   * How detections are listed (Detection tab, History), from the saved
   * settings.detection: by category in `categoryOrder` (default), or by
   * confidence when `sortBy` is 'confidence'.
   * @param {object} [detectionSettings] - settings.detection
   * @returns {{sortBy: ('category'|'confidence'), categoryOrder: string[]}}
   */
  static detectionSortOf(detectionSettings) {
    const saved = detectionSettings || {};
    return {
      sortBy: saved.sortBy === DetectionUtils.SORT_BY_CONFIDENCE ? DetectionUtils.SORT_BY_CONFIDENCE : 'category',
      categoryOrder: DetectionUtils.normalizeCategoryOrder(saved.categoryOrder)
    };
  }

  /** 'antibot' | 'captcha' | 'fingerprint' | 'other' for any spelling of a category */
  static categoryKey(category) {
    return Categories.keyOf(category);
  }

  /**
   * A sorted copy of `items`. By category: the chosen category order, then
   * the highest confidence. By confidence: highest first, ties in category
   * order. Equal items keep their order.
   * @param {Array} items
   * @param {{sortBy?: string, categoryOrder?: string[]}} [sort] - from detectionSortOf()
   * @param {function(*): {category: string, confidence: number}} [pick] - reads the detection from an item
   * @returns {Array}
   */
  static sortDetections(items, sort = {}, pick = (item) => item) {
    const order = DetectionUtils.normalizeCategoryOrder(sort.categoryOrder);
    const rank = (item) => {
      const index = order.indexOf(DetectionUtils.categoryKey(pick(item)?.category));
      return index === -1 ? order.length : index;
    };
    const confidence = (item) => Number(pick(item)?.confidence) || 0;
    const byCategory = (a, b) => rank(a) - rank(b);
    const byConfidence = (a, b) => confidence(b) - confidence(a);
    const compare = sort.sortBy === DetectionUtils.SORT_BY_CONFIDENCE
      ? (a, b) => byConfidence(a, b) || byCategory(a, b)
      : (a, b) => byCategory(a, b) || byConfidence(a, b);
    return (Array.isArray(items) ? items : [])
      .map((item, index) => ({ item, index }))
      .sort((a, b) => compare(a.item, b.item) || (a.index - b.index))
      .map(entry => entry.item);
  }

  /**
   * An official detector is one Scrapfly ships: its author is "Scrapfly" AND
   * its ID is one of the detectors bundled in detectors/index.json. The author
   * alone is not enough, because anyone can type it into an imported file.
   * Official detectors show the verified check and can be disabled but never
   * deleted.
   * @param {object} detector
   * @param {Set<string>|Array<string>} [officialIds] - defaults to the registered bundled IDs
   * @returns {boolean}
   */
  static isOfficialDetector(detector, officialIds = DetectionUtils._officialDetectorIds) {
    if (!detector || typeof detector !== 'object') return false;
    if (!DetectionUtils.isReservedAuthor(detector.author)) return false;
    const ids = officialIds instanceof Set ? officialIds : new Set(officialIds || []);
    return typeof detector.id === 'string' && ids.has(detector.id);
  }

  /**
   * Normalize difficulty label to canonical values.
   * @param {string} value
   * @returns {'Low'|'Medium'|'High'|null}
   */
  static normalizeDifficulty(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'low') return 'Low';
    if (normalized === 'medium') return 'Medium';
    if (normalized === 'high') return 'High';
    return null;
  }

  /**
   * Convert difficulty label to numeric rank.
   * @param {string} label
   * @returns {0|1|2|3}
   */
  static getDifficultyRank(label) {
    const normalized = DetectionUtils.normalizeDifficulty(label);
    if (normalized === 'Low') return 1;
    if (normalized === 'Medium') return 2;
    if (normalized === 'High') return 3;
    return 0;
  }

  /**
   * Convert numeric rank back to difficulty label.
   * @param {number} rank
   * @returns {'Low'|'Medium'|'High'}
   */
  static rankToDifficulty(rank) {
    if (rank >= 3) return 'High';
    if (rank >= 2) return 'Medium';
    return 'Low';
  }

  /**
   * Get default detector difficulty for a category.
   * @param {string} category
   * @returns {'Low'|'Medium'|'High'}
   */
  static defaultDifficultyForCategory(category) {
    return Categories.defaultDifficulty(category);
  }

  /**
   * Compute the average confidence for a list of detections (0-100).
   * @param {Array} detections
   * @returns {number}
   */
  static computeAverageConfidence(detections = []) {
    if (!Array.isArray(detections) || detections.length === 0) return 0;
    const total = detections.reduce((sum, d) => sum + (d?.confidence || 0), 0);
    return Math.round(total / detections.length);
  }

  /**
   * Toolbar badge colour for a page's detections. The badge always follows the
   * page difficulty shown in the popup (Baja/Media/Alta), coloured with the
   * user's badge colours, so every path that sets it agrees.
   * @param {Array} detections
   * @param {{low: string, medium: string, high: string}} badgeColors
   * @returns {string}
   */
  static getBadgeColor(detections, badgeColors) {
    const difficulty = DetectionUtils.getDifficultyLevel(detections);
    if (difficulty === 'High') return badgeColors.high;
    if (difficulty === 'Medium') return badgeColors.medium;
    return badgeColors.low;
  }

  /**
   * The confidence from which a protection counts as present on a page: History's own line (HistoryPolicy.CHANGE_SURE, under
   * 25% it is absent). A script that only names a vendor scores 5-10%, so it never sets the page difficulty.
   */
  static PRESENT_CONFIDENCE = 50;

  /** A high-tier provider (Shape Security, hCaptcha, Arkose Labs / FunCaptcha) found at this confidence makes a page High. */
  static HIGH_TIER_CONFIDENCE = 80;

  /** An anti-bot or a CAPTCHA, in any spelling of the category (Categories.keyOf): never fingerprinting or another category. */
  static isProtection(detection) {
    const key = Categories.keyOf(detection);
    return key === 'antibot' || key === 'captcha';
  }

  /** A detection's confidence; one saved without a score counts as found, as History counts it (HistoryPolicy.diffProtections). */
  static scoreOf(detection) {
    const score = Number(detection && detection.confidence);
    return Number.isFinite(score) ? score : 100;
  }

  /**
   * Does this detection count towards the page difficulty? An anti-bot or a CAPTCHA present on the page (PRESENT_CONFIDENCE or
   * more). A passing mention of a vendor, and fingerprinting, which runs on most sites, never make a page look harder.
   */
  static countsForDifficulty(detection) {
    return !!detection && typeof detection === 'object' && DetectionUtils.isProtection(detection)
      && DetectionUtils.scoreOf(detection) >= DetectionUtils.PRESENT_CONFIDENCE;
  }

  /** Shape Security, hCaptcha, Arkose Labs / FunCaptcha, by the detection's name (a detector object, a plain string or its own name) */
  static isHighTierName(detection) {
    const nested = detection?.detector && typeof detection.detector === 'object' ? detection.detector.name : detection?.detector;
    const name = String((typeof nested === 'string' && nested) || detection?.name || '').toLowerCase();
    return name.includes('shape security') ||
      name.includes('shapesecurity') ||
      name.includes('hcaptcha') ||
      name.includes('arkose') ||
      name.includes('funcaptcha');
  }

  /**
   * The page difficulty and what set it: the one rule behind the popup's Difficulty tile and its tip, the toolbar badge colour,
   * History, Statistics, Bulk scan and the exports. A UI-facing estimate (Low/Medium/High), not a security guarantee.
   *
   *   High    a high-tier provider found at HIGH_TIER_CONFIDENCE or more ('highTier')
   *   floor   the hardest difficulty of a detector that counts (countsForDifficulty) is a minimum ('detector')
   *   Medium  at least two that count ('several'), or their average confidence above 60% ('confidence')
   *   Low     otherwise: 'none' when nothing counts, 'default' when what counts is weak and has no harder difficulty of its own
   *
   * @param {Array} detections
   * @returns {{difficulty: 'Low'|'Medium'|'High', reason: string, source: (object|null), counted: Array}} source: the
   *   detection that set the level (highTier, detector); counted: the detections that count, hardest first
   */
  static difficultyOf(detections = []) {
    const list = (Array.isArray(detections) ? detections : []).filter(d => d && typeof d === 'object');
    const rankOf = (d) => DetectionUtils.getDifficultyRank(DetectionUtils.normalizeDifficulty(d.difficulty || d.detector?.difficulty));
    const counted = list.filter(DetectionUtils.countsForDifficulty)
      .map((detection, index) => ({ detection, index }))
      .sort((a, b) => rankOf(b.detection) - rankOf(a.detection)
        || DetectionUtils.scoreOf(b.detection) - DetectionUtils.scoreOf(a.detection) || a.index - b.index)
      .map(entry => entry.detection);

    const highTier = list.find(d => DetectionUtils.isHighTierName(d) && (Number(d.confidence) || 0) >= DetectionUtils.HIGH_TIER_CONFIDENCE);
    if (highTier) return { difficulty: 'High', reason: 'highTier', source: highTier, counted };

    const average = counted.length ? counted.reduce((sum, d) => sum + DetectionUtils.scoreOf(d), 0) / counted.length : 0;
    const several = counted.length >= 2;
    const raised = several || average > 60;
    // The hardest detector that counts sets a minimum; it names the level when it reaches the one the rules above give
    const floorRank = counted.length ? rankOf(counted[0]) : 0;
    if (floorRank > 0 && floorRank >= DetectionUtils.getDifficultyRank(raised ? 'Medium' : 'Low')) {
      return { difficulty: DetectionUtils.rankToDifficulty(floorRank), reason: 'detector', source: counted[0], counted };
    }
    if (raised) return { difficulty: 'Medium', reason: several ? 'several' : 'confidence', source: null, counted };
    return { difficulty: 'Low', reason: counted.length ? 'default' : 'none', source: null, counted };
  }

  /**
   * The page difficulty for a set of detections (difficultyOf).
   * @param {Array} detections
   * @returns {'Low'|'Medium'|'High'}
   */
  static getDifficultyLevel(detections = []) {
    return DetectionUtils.difficultyOf(detections).difficulty;
  }

  /**
   * Compute difficulty + default color.
   * @param {Array} detections
   * @returns {{difficulty: 'Low'|'Medium'|'High', difficultyColor: string}}
   */
  static getDifficultyInfo(detections = []) {
    const difficulty = DetectionUtils.getDifficultyLevel(detections);
    const colors = {
      High: '#ef4444',
      Medium: '#f59e0b',
      Low: '#22c55e'
    };
    return { difficulty, difficultyColor: colors[difficulty] || colors.Low };
  }
}

if (typeof window !== 'undefined') {
  window.DetectionUtils = DetectionUtils;
} else if (typeof self !== 'undefined') {
  self.DetectionUtils = DetectionUtils;
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = DetectionUtils; }
