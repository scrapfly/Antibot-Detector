/**
 * Canonical badge constants and helpers.
 * Shared across popup and background contexts.
 */

const BADGE = {
    TEXT: {
        LOADING: '\u280b',
        DISABLED: 'OFF',
        BLACKLISTED: 'BLK',
        INTERRUPTED: '\u21BB',
        CLEARED: '\u21BB',
        CLEAN: '',
        EMPTY: ''
    },

    COLORS: {
        LOW: '#22c55e',
        MEDIUM: '#f59e0b',
        HIGH: '#ef4444',
        LOADING: '#3b82f6',
        DISABLED: '#f97316',
        BLACKLISTED: '#f97316',
        CLEARED: '#6B7280',
        CLEAN: '#22c55e'
    },

    THRESHOLDS: {
        MEDIUM: 3,
        HIGH: 5
    },

    // Braille frames for the animated "analyzing" badge spinner (driven from the
    // background while a detection runs). LOADING above is frame 0.
    SPINNER_FRAMES: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
};

function getBadgeColorForCount(count) {
    const colors = BADGE.COLORS;
    if (count >= BADGE.THRESHOLDS.HIGH) return colors.HIGH;
    if (count >= BADGE.THRESHOLDS.MEDIUM) return colors.MEDIUM;
    return colors.LOW;
}

// True if a badge text represents the "loading/analyzing" state — either the
// static LOADING glyph or any animated spinner frame. Use this instead of
// `text === BADGE.TEXT.LOADING` so checks work while the spinner is cycling.
function isLoadingBadgeText(text) {
    const t = (text || '').trim();
    return t === BADGE.TEXT.LOADING || BADGE.SPINNER_FRAMES.indexOf(t) !== -1;
}

const badgeGlobal = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null));

if (badgeGlobal) {
    badgeGlobal.BADGE = BADGE;
    badgeGlobal.getBadgeColorForCount = getBadgeColorForCount;
    badgeGlobal.isLoadingBadgeText = isLoadingBadgeText;
}

