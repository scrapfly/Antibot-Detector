/**
 * Canonical badge constants and helpers.
 * Shared across popup and background contexts.
 */

const BADGE = {
    TEXT: {
        LOADING: '\u23F3',
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
        INTERRUPTED: '#3b82f6',
        CLEARED: '#3b82f6',
        CLEAN: '#22c55e'
    },

    THRESHOLDS: {
        MEDIUM: 3,
        HIGH: 5
    }
};

function getBadgeColorForCount(count) {
    const colors = BADGE.COLORS;
    if (count >= BADGE.THRESHOLDS.HIGH) return colors.HIGH;
    if (count >= BADGE.THRESHOLDS.MEDIUM) return colors.MEDIUM;
    return colors.LOW;
}

async function setBadge(tabId, text, color) {
    try {
        await chrome.action.setBadgeText({ text, tabId });
        await chrome.action.setBadgeBackgroundColor({ color, tabId });
    } catch (error) {
        if (!error.message?.includes('No tab with id')) {
            Logger.error('BADGE', 'Failed to set badge', error);
        }
    }
}

async function clearBadge(tabId) {
    try {
        await chrome.action.setBadgeText({ text: '', tabId });
    } catch (error) {
        if (!error.message?.includes('No tab with id')) {
            Logger.error('BADGE', 'Failed to clear badge', error);
        }
    }
}

const badgeGlobal = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null));

if (badgeGlobal) {
    badgeGlobal.BADGE = BADGE;
    badgeGlobal.getBadgeColorForCount = getBadgeColorForCount;
    badgeGlobal.setBadge = setBadge;
    badgeGlobal.clearBadge = clearBadge;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BADGE,
        getBadgeColorForCount,
        setBadge,
        clearBadge
    };
}
