/**
 * FormatUtils - Pure formatting and display utility functions
 * Time formatting, HTML escaping, clipboard operations
 */
class FormatUtils {

  // Milliseconds per duration unit. A month counts as 30 days, a year as 365.
  static UNIT_MS = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000
  };

  // Largest cache duration allowed per unit (Settings → Detection → Cache Duration).
  static CACHE_UNIT_MAX = { minutes: 60, hours: 24, days: 30, months: 12, years: 10 };

  /**
   * Convert time duration to milliseconds
   * @param {number} duration - Duration value
   * @param {string} unit - Time unit ('minutes', 'hours', 'days', 'months', 'years')
   * @returns {number} Duration in milliseconds (unknown units count as hours)
   */
  static convertToMilliseconds(duration, unit) {
    const unitMs = FormatUtils.UNIT_MS[unit] || FormatUtils.UNIT_MS.hours;
    return duration * unitMs;
  }

  /**
   * Bring a stored cache duration inside the per-unit range without changing
   * its length. Values saved before the ranges existed (e.g. 48 hours) move
   * to the smallest unit that holds them as an in-range integer (2 days), so
   * the expiry stays identical. When no exact form exists, the nearest valid
   * duration is used (ties go to the longer one).
   * @param {number} duration
   * @param {string} unit
   * @returns {{duration: number, unit: string, exact: boolean}}
   */
  static normalizeCacheDuration(duration, unit) {
    const unitMs = FormatUtils.UNIT_MS;
    const max = FormatUtils.CACHE_UNIT_MAX;
    const units = Object.keys(unitMs);
    const value = Number(duration);
    const sourceUnit = unitMs[unit] ? unit : 'hours';
    if (!Number.isFinite(value) || value <= 0) {
      return { duration: 12, unit: 'hours', exact: false };
    }
    if (Number.isInteger(value) && value >= 1 && value <= max[sourceUnit]) {
      return { duration: value, unit: sourceUnit, exact: true };
    }

    const totalMs = value * unitMs[sourceUnit];
    for (const candidate of units) {
      const amount = totalMs / unitMs[candidate];
      const rounded = Math.round(amount);
      if (Math.abs(amount - rounded) < 1e-9 && rounded >= 1 && rounded <= max[candidate]) {
        return { duration: rounded, unit: candidate, exact: true };
      }
    }

    let best = null;
    for (const candidate of units) {
      const amount = totalMs / unitMs[candidate];
      for (const option of [Math.floor(amount), Math.ceil(amount)]) {
        const clamped = Math.min(Math.max(option, 1), max[candidate]);
        const ms = clamped * unitMs[candidate];
        const diff = Math.abs(ms - totalMs);
        if (!best || diff < best.diff || (diff === best.diff && ms > best.ms)) {
          best = { duration: clamped, unit: candidate, diff, ms };
        }
      }
    }
    return { duration: best.duration, unit: best.unit, exact: false };
  }

  /**
   * Localised text with `{0}`, `{1}` placeholders: the UI-language message
   * for `key`, or the English `fallback` with the same substitutions when the
   * message (or the i18n layer) is unavailable.
   * @param {string} key
   * @param {string} fallback
   * @param {...*} args
   * @returns {string}
   */
  static t(key, fallback, ...args) {
    const msg = (typeof I18n !== 'undefined' && I18n && typeof I18n.format === 'function')
      ? I18n.format(key, ...args)
      : null;
    if (msg) return msg;
    return args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), String(fallback));
  }

  /**
   * BCP 47 tag of the UI language for Intl formatters, or null when the i18n
   * layer is not loaded (Node tests, service worker before i18n) so callers
   * keep their English / format-key output.
   * @returns {string|null}
   */
  static uiLocale() {
    try {
      if (typeof I18n !== 'undefined' && I18n && typeof I18n.locale === 'function') {
        const tag = I18n.locale();
        if (tag) return String(tag).replace('_', '-');
      }
    } catch (_) { /* fall through to null */ }
    return null;
  }

  /**
   * Format a relative time in the UI language with Intl.RelativeTimeFormat
   * ("3h ago", "hace 3 h", "3時間前"). Returns null when Intl or the UI locale
   * is unavailable, or the locale is rejected, so the caller can fall back.
   * @param {number} value - Signed amount (negative = in the past)
   * @param {string} unit - Intl unit ('second', 'minute', 'hour', 'day', ...)
   * @param {string} [style='narrow'] - 'long' | 'short' | 'narrow'
   * @returns {string|null}
   */
  static formatRelative(value, unit, style = 'narrow') {
    const locale = FormatUtils.uiLocale();
    if (!locale || typeof Intl === 'undefined' || typeof Intl.RelativeTimeFormat !== 'function') return null;
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'always', style }).format(value, unit);
    } catch (_) {
      return null;
    }
  }

  /**
   * Join names as one list in the UI language ("A, B and C", "A、B和C"),
   * or with commas when Intl or the UI locale is unavailable.
   * @param {string[]} items
   * @returns {string}
   */
  static formatList(items) {
    const values = (Array.isArray(items) ? items : []).map(String);
    const locale = FormatUtils.uiLocale();
    if (locale && typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
      try {
        return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values);
      } catch (_) { /* fall through */ }
    }
    return values.join(', ');
  }

  /**
   * Format a date and time in the UI language (falls back to the runtime's
   * default toLocaleString when the UI locale is unavailable).
   * @param {number|Date} value
   * @returns {string}
   */
  static formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    const locale = FormatUtils.uiLocale();
    if (locale && typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
      } catch (_) { /* fall back below */ }
    }
    return date.toLocaleString();
  }

  /**
   * Format timestamp as "X time ago" (e.g., "3h ago", "2d ago"), in the UI
   * language via Intl.RelativeTimeFormat when available.
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Human-readable time ago string
   */
  static getTimeAgo(timestamp) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const get = (key, fallback) => (t && t.get(key)) || fallback;
    const fmt = (key, fallback, n, unit) => FormatUtils.formatRelative(-n, unit)
      || (t && t.format(key, n)) || fallback;

    if (!timestamp) return get('timeUnknown', 'Unknown');

    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 0) return get('timeJustNow', 'Just now');

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return fmt('timeDaysAgoFmt', `${days}d ago`, days, 'day');
    if (hours > 0) return fmt('timeHoursAgoFmt', `${hours}h ago`, hours, 'hour');
    if (minutes > 0) return fmt('timeMinutesAgoFmt', `${minutes}m ago`, minutes, 'minute');
    if (seconds > 0) return fmt('timeSecondsAgoFmt', `${seconds}s ago`, seconds, 'second');
    return get('timeJustNow', 'Just now');
  }

  /**
   * Convert a hex colour to RGB (the one shared implementation).
   * @param {string} hex - "#FF5733" or "FF5733"
   * @returns {{r: number, g: number, b: number}|null} null when not a 6-digit hex
   */
  static hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const result = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} HTML-escaped text
   */
  static escapeHtml(text) {
    if (!text) return '';

    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Escape a value for use inside an HTML attribute ("..."). escapeHtml alone
   * does NOT escape quotes, so it is unsafe for attribute context — a value
   * containing a double-quote could break out. Use this for src/alt/title/etc.
   * @param {*} text
   * @returns {string}
   */
  static escapeAttr(text) {
    return FormatUtils.escapeHtml(text)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Shared confidence display scale: 0-50 green, 51-79 orange, 80-100 red.
   * @param {number} confidence
   * @returns {'green'|'amber'|'red'}
   */
  static confidenceTone(confidence) {
    const value = Math.round(Number(confidence) || 0);
    return value <= 50 ? 'green' : (value >= 80 ? 'red' : 'amber');
  }

  /**
   * A confidence value as 2.8 shows it: dial icon + coloured "NN%" text,
   * with a "Confidence" hover tip (or the given tip). extraClass places it in a layout.
   * @param {number} confidence
   * @param {string} [extraClass]
   * @param {{title:string, detail?:string, rows?:Array}} [tip]
   * @returns {string}
   */
  static confidenceHtml(confidence, extraClass = '', tip = null) {
    const value = Math.max(0, Math.min(100, Math.round(Number(confidence) || 0)));
    const tone = FormatUtils.confidenceTone(value);
    const tipAttrs = tip && tip.title
      ? FormatUtils.tipAttrs(tip.title, tip.detail, tip.rows)
      : `data-tip="${FormatUtils.escapeAttr(FormatUtils.t('detectionModalConfidence', 'Confidence'))}"`;
    return `<span class="conf-metric tone-${tone}${extraClass ? ` ${extraClass}` : ''}" ${tipAttrs}>`
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 12l4-4"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/></svg>'
      + `<span class="conf-metric-value">${value}%</span></span>`;
  }

  /**
   * A difficulty as the cards show it: the translated level name, coloured
   * green for Low, orange for Medium, or red for High. Hover says "Difficulty"
   * unless a tip is given.
   * @param {'Low'|'Medium'|'High'} difficulty
   * @param {string} text - Translated level name
   * @param {string} [extraClass]
   * @param {{title:string, detail?:string, rows?:Array}} [tip]
   * @returns {string}
   */
  static difficultyHtml(difficulty, text, extraClass = '', tip = null) {
    const tipAttrs = tip && tip.title
      ? FormatUtils.tipAttrs(tip.title, tip.detail, tip.rows)
      : `data-tip="${FormatUtils.escapeAttr(FormatUtils.t('detectionModalDifficulty', 'Difficulty'))}"`;
    const tone = { low: 'green', medium: 'amber', high: 'red' }[String(difficulty || '').toLowerCase()];
    return `<span class="diff-metric${tone ? ` tone-${tone}` : ''}${extraClass ? ` ${extraClass}` : ''}" ${tipAttrs}>${FormatUtils.escapeHtml(text || difficulty || '')}</span>`;
  }

  /**
   * Hover tip attributes for the shared Tooltip (modules/ui/tooltip.js):
   * a title, an optional muted detail line and optional breakdown rows
   * ({ label, value, dot?, tone? }). Returns a string to put inside a tag.
   * @param {string} title
   * @param {string} [detail]
   * @param {Array<{label:string, value?:string|number, dot?:string, tone?:string}>} [rows]
   * @param {string} [dot] - Class for the title's coloured dot (e.g. cat-captcha)
   * @returns {string}
   */
  static tipAttrs(title, detail = '', rows = [], dot = '') {
    const attr = FormatUtils.escapeAttr;
    let out = `data-tip="${attr(title)}"`;
    if (detail) out += ` data-tip-detail="${attr(detail)}"`;
    if (dot) out += ` data-tip-dot="${attr(dot)}"`;
    const list = (rows || []).filter(row => row && (row.label || row.value !== undefined));
    if (list.length) out += ` data-tip-rows="${attr(JSON.stringify(list))}"`;
    return out;
  }

  /** Same as tipAttrs, applied to an element that already exists. */
  static setTip(element, title, detail = '', rows = [], dot = '') {
    if (!element || typeof element.setAttribute !== 'function') return;
    // The tip is now set from code: a later i18n pass must not bring back the
    // static one-line title, which the shared Tooltip would adopt over this one
    element.removeAttribute('title');
    element.removeAttribute('data-i18n-title');
    element.setAttribute('data-tip', title);
    const set = (name, value) => (value ? element.setAttribute(name, value) : element.removeAttribute(name));
    set('data-tip-detail', detail);
    set('data-tip-dot', dot);
    const list = (rows || []).filter(row => row && (row.label || row.value !== undefined));
    set('data-tip-rows', list.length ? JSON.stringify(list) : '');
  }

  /** anti-bot / captcha / fingerprint / other from a detection or category name. */
  static categoryKey(value) {
    const raw = value && typeof value === 'object' ? (value.category || value.detector?.category) : value;
    const normalized = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.includes('captcha')) return 'captcha';
    if (normalized.includes('fingerprint')) return 'fingerprint';
    if (normalized.includes('antibot') || normalized.includes('bot') || normalized.includes('waf')) return 'antibot';
    return 'other';
  }

  static categoryLabel(key) {
    const labels = {
      antibot: ['categoryAntibot', 'Anti-bot'], captcha: ['categoryCaptcha', 'Captcha'],
      fingerprint: ['categoryFingerprint', 'Fingerprint'], other: ['statsCategoryOther', 'Other']
    };
    const [messageKey, fallback] = labels[key] || labels.other;
    return FormatUtils.t(messageKey, fallback);
  }

  static detectionName(detection) {
    if (!detection) return '';
    if (typeof detection.detector === 'string') return detection.detector;
    return detection.detector?.name || detection.name || detection.detector?.id || '';
  }

  /**
   * One line on what a detection method checks, for hover tips.
   * @param {string} typeKey - url, header, cookie, content, dom, js_hooks, window, payload
   * @returns {string}
   */
  static methodHint(typeKey) {
    const hints = {
      url: ['tipMethodUrl', 'The page or a request it made matched a known address.'],
      header: ['tipMethodHeader', 'A response header sent by the site matched.'],
      cookie: ['tipMethodCookie', 'A cookie set on this site matched.'],
      content: ['tipMethodContent', 'Text found in the page or its scripts matched.'],
      dom: ['tipMethodDom', 'An element on the page matched.'],
      js_hooks: ['tipMethodJsHooks', 'The page called a browser API that this detector watches.'],
      window: ['tipMethodWindow', 'A global JavaScript object on the page matched.'],
      payload: ['tipMethodPayload', 'Data the page sent in a request matched.']
    };
    const key = String(typeKey || '').toLowerCase().replace(/^(url|header|cookie)s$/, '$1');
    const entry = hints[key];
    return entry ? FormatUtils.t(entry[0], entry[1]) : '';
  }

  /**
   * Breakdowns for a set of detections, shared by the summary tiles in
   * Detection and History so both explain their numbers the same way.
   * @param {Array<object>} detections
   * @returns {{total:number, categories:Array<{key,count,pct}>, scores:Array<{name,confidence,category}>,
   *   average:number, min:number, max:number}}
   */
  static detectionBreakdown(detections = []) {
    const list = (Array.isArray(detections) ? detections : []).filter(d => d && typeof d === 'object');
    const order = ['antibot', 'captcha', 'fingerprint', 'other'];
    const counts = { antibot: 0, captcha: 0, fingerprint: 0, other: 0 };
    list.forEach(d => { counts[FormatUtils.categoryKey(d)]++; });
    const total = list.length;
    const categories = order.filter(key => counts[key] > 0)
      .map(key => ({ key, count: counts[key], pct: total ? Math.round(counts[key] / total * 100) : 0 }));
    const scores = list.map(d => ({
      name: FormatUtils.detectionName(d) || FormatUtils.t('timeUnknown', 'Unknown'),
      confidence: Math.max(0, Math.min(100, Math.round(Number(d.confidence) || 0))),
      category: FormatUtils.categoryKey(d)
    })).sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
    const values = scores.map(s => s.confidence);
    return {
      total,
      categories,
      scores,
      average: values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0,
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0
    };
  }

  /** Tip for a "Detections" tile: count per category. */
  static detectionsTip(detections, title) {
    const b = FormatUtils.detectionBreakdown(detections);
    const detail = FormatUtils.t('detectionTipDetections', 'Number of protections detected on this page.');
    const rows = b.categories.map(c => ({
      label: FormatUtils.categoryLabel(c.key), dot: `cat-${c.key}`,
      value: FormatUtils.t('tipCountShareFmt', '{0} · {1}%', c.count, c.pct)
    }));
    return { title: title || FormatUtils.t('statDetections', 'Detections'), detail, rows };
  }

  /** Tip for a "Confidence" tile: what it averages, then the strongest detections. */
  static confidenceTip(detections, title, maxRows = 5) {
    const b = FormatUtils.detectionBreakdown(detections);
    const detail = b.total > 1
      ? FormatUtils.t('tipConfidenceAverageFmt', 'Average of {0} detections, from {1}% to {2}%', b.total, b.min, b.max)
      : FormatUtils.t('detectionTipConfidence', 'Average confidence across detected protections.');
    const rows = b.scores.slice(0, maxRows).map(s => ({
      label: s.name, dot: `cat-${s.category}`, value: `${s.confidence}%`, tone: FormatUtils.confidenceTone(s.confidence)
    }));
    if (b.scores.length > maxRows) {
      rows.push({ label: FormatUtils.t('tipMoreFmt', '+{0} more', b.scores.length - maxRows) });
    }
    return { title: title || FormatUtils.t('statConfidence', 'Confidence'), detail, rows };
  }

  /**
   * Tip for a "Difficulty" tile: the level and why. Mirrors
   * DetectionUtils.getDifficultyLevel: high-tier providers, the strongest
   * rule-set level, and the count/confidence escalation.
   */
  static difficultyTip(detections, difficulty, title) {
    const list = (Array.isArray(detections) ? detections : []).filter(d => d && typeof d === 'object');
    const levelName = level => FormatUtils.t(`difficulty${level}`, level);
    const tone = { High: 'red', Medium: 'amber', Low: 'green' };
    const rank = { Low: 1, Medium: 2, High: 3 };
    const reasons = [];
    const normalize = value => (typeof DetectionUtils !== 'undefined' && DetectionUtils.normalizeDifficulty)
      ? DetectionUtils.normalizeDifficulty(value) : (['Low', 'Medium', 'High'].includes(value) ? value : null);
    // Hardest detections first: each one's own level
    const ranked = list.map(d => ({
      name: FormatUtils.detectionName(d) || FormatUtils.t('timeUnknown', 'Unknown'),
      level: normalize(d.difficulty || d.detector?.difficulty)
        || ((typeof DetectionUtils !== 'undefined' && DetectionUtils.defaultDifficultyForCategory)
          ? DetectionUtils.defaultDifficultyForCategory(d.category || d.detector?.category) : 'Medium'),
      category: FormatUtils.categoryKey(d)
    })).sort((a, b) => (rank[b.level] || 0) - (rank[a.level] || 0) || a.name.localeCompare(b.name));
    const rows = ranked.slice(0, 4).map(r => ({ label: r.name, dot: `cat-${r.category}`, value: levelName(r.level), tone: tone[r.level] }));
    if (ranked.length > 4) rows.push({ label: FormatUtils.t('tipMoreFmt', '+{0} more', ranked.length - 4) });
    const highTier = ranked.find(r => /shape ?security|hcaptcha|arkose|funcaptcha/i.test(r.name));
    if (difficulty === 'High' && highTier) reasons.push(FormatUtils.t('tipDifficultyHardestFmt', 'Set by {0}', highTier.name));
    else if (ranked.length && ranked[0].level === difficulty) reasons.push(FormatUtils.t('tipDifficultyHardestFmt', 'Set by {0}', ranked[0].name));
    else if (difficulty !== 'Low' && list.length > 2) reasons.push(FormatUtils.t('tipDifficultyManyFmt', 'Raised by {0} protections together', list.length));
    const detail = reasons[0] || FormatUtils.t('detectionTipDifficulty', 'Estimated difficulty of bypassing the detected protections.');
    return { title: title || `${FormatUtils.t('statDifficulty', 'Difficulty')}: ${levelName(difficulty)}`, detail, rows };
  }

  /**
   * Copy text to clipboard with optional visual feedback
   * @param {string} text - Text to copy
   * @param {object} options - Feedback options
   * @param {HTMLElement|null} options.element - Element to show inline feedback on
   * @param {boolean} [options.notify=true] - Display toast notification on success
   * @param {string} [options.notificationMessage='Copied'] - Success toast message
   * @param {string} [options.inlineMessage='Copied!'] - Temporary inline message
   * @param {number} [options.revertDelay=1600] - Delay before inline message reverts (ms)
   * @param {boolean} [options.useMicroToast=true] - Use compact micro toast vs full toast
   * @returns {Promise<boolean>} True if copy succeeded
   */
  static async copyToClipboard(text, {
    element = null,
    notify = true,
    notificationMessage = null,
    inlineMessage = null,
    revertDelay = 1600,
    useMicroToast = true
  } = {}) {
    const _i18n = (typeof I18n !== 'undefined') ? I18n : null;
    if (notificationMessage == null) {
      notificationMessage = (_i18n && _i18n.tr('copiedNotification', 'Copied')) || 'Copied';
    }
    if (inlineMessage == null) {
      inlineMessage = (_i18n && _i18n.tr('copiedInlineMsg', '\u2713 Copied!')) || '\u2713 Copied!';
    }
    let success = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      Logger.error('UTIL', 'Failed to copy to clipboard:', error);
      success = false;
    }

    if (!success) {
      if (notify && typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.error === 'function') {
        NotificationHelper.error((_i18n && _i18n.tr('clipboardCopyFailed', 'Failed to copy to clipboard')) || 'Failed to copy to clipboard');
      }
      return false;
    }

    // Only show toast if no inline feedback element is provided (avoid redundancy)
    if (notify && !element && typeof NotificationHelper !== 'undefined') {
      if (useMicroToast && typeof NotificationHelper.micro === 'function') {
        NotificationHelper.micro(notificationMessage);
      } else if (typeof NotificationHelper.success === 'function') {
        NotificationHelper.success(notificationMessage);
      }
    }

    if (element && typeof document !== 'undefined') {
      const isInput = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      const originalValue = isInput ? element.value : element.textContent;
      const originalHtml = !isInput ? element.innerHTML : null;

      element.dataset.copyOriginal = originalValue ?? '';
      if (!isInput && originalHtml !== null && originalHtml !== undefined) {
        element.dataset.copyOriginalHtml = originalHtml;
      }

      if (isInput) {
        element.value = inlineMessage;
      } else {
        element.textContent = inlineMessage;
      }

      element.classList.add('copy-feedback-active');

      window.setTimeout(() => {
        if (!element.dataset) {
          return;
        }

        const original = element.dataset.copyOriginal;
        const originalInnerHtml = element.dataset.copyOriginalHtml;
        if (isInput) {
          if (original !== undefined) {
            element.value = original;
          }
        } else if (originalInnerHtml !== undefined) {
          element.innerHTML = originalInnerHtml;
        } else if (original !== undefined) {
          element.textContent = original;
        }

        element.classList.remove('copy-feedback-active');
        delete element.dataset.copyOriginal;
        if (element.dataset.copyOriginalHtml !== undefined) {
          delete element.dataset.copyOriginalHtml;
        }
      }, revertDelay);
    }

    return true;
  }
}

if (typeof window !== 'undefined') {
  window.FormatUtils = FormatUtils;
} else if (typeof self !== 'undefined') {
  self.FormatUtils = FormatUtils;
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = FormatUtils; }
