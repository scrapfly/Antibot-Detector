/**
 * Centralized Badge Constants
 * All badge text and colors defined in one place for consistency
 */

const BADGE = {
  // Badge text for different states
  TEXT: {
    LOADING: '\u23F3',      // Hourglass - detection in progress
    DISABLED: 'OFF',        // Extension is disabled
    BLACKLISTED: 'BLK',     // Domain is blacklisted
    INTERRUPTED: '\u21BB',  // Reload symbol - needs page reload
    CLEARED: '\u21BB',      // Reload symbol - user cleared data, needs reload
    CLEAN: '',              // Empty - no detections found
    EMPTY: ''               // Empty badge
  },

  // Badge colors for different states
  COLORS: {
    // Detection count thresholds
    LOW: '#22c55e',         // Green (1-2 detections)
    MEDIUM: '#f59e0b',      // Amber (3-4 detections)
    HIGH: '#ef4444',        // Red (5+ detections)

    // Special states
    LOADING: '#3b82f6',     // Blue - detection running
    DISABLED: '#6b7280',    // Gray - extension off
    BLACKLISTED: '#f97316', // Orange - domain blocked
    INTERRUPTED: '#3b82f6', // Blue - reload needed
    CLEARED: '#3b82f6',     // Blue - user cleared data, needs reload
    CLEAN: '#22c55e'        // Green - clean page
  },

  // Detection count thresholds
  THRESHOLDS: {
    MEDIUM: 3,  // 3-4 detections = medium risk
    HIGH: 5     // 5+ detections = high risk
  }
};

// Helper function to get badge color based on detection count
function getBadgeColorForCount(count, customColors = null) {
  const colors = customColors || BADGE.COLORS;
  if (count >= BADGE.THRESHOLDS.HIGH) return colors.HIGH;
  if (count >= BADGE.THRESHOLDS.MEDIUM) return colors.MEDIUM;
  return colors.LOW;
}

// Helper function to set badge with consistent error handling
async function setBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeText({ text: text, tabId: tabId });
    await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
  } catch (error) {
    if (!error.message?.includes('No tab with id')) {
      console.error('[Badge] Failed to set badge:', error.message);
    }
  }
}

// Helper function to clear badge
async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ text: '', tabId: tabId });
  } catch (error) {
    if (!error.message?.includes('No tab with id')) {
      console.error('[Badge] Failed to clear badge:', error.message);
    }
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.BADGE = BADGE;
  window.getBadgeColorForCount = getBadgeColorForCount;
  window.setBadge = setBadge;
  window.clearBadge = clearBadge;
}
