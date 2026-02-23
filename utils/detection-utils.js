/**
 * DetectionUtils - Detection confidence scoring and difficulty analysis
 */
class DetectionUtils {

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
    const normalized = String(category || '').toLowerCase().replace(/[^a-z]/g, '');
    if (normalized === 'captcha') return 'High';
    if (normalized === 'fingerprint') return 'Low';
    if (normalized === 'antibot') return 'Medium';
    return 'Medium';
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
   * Compute a difficulty level for a set of detections.
   * This is a UI-facing heuristic (Low/Medium/High), not a security guarantee.
   * @param {Array} detections
   * @param {number} [avgConfidence]
   * @returns {'Low'|'Medium'|'High'}
   */
  static getDifficultyLevel(detections = [], avgConfidence = undefined) {
    const totalDetections = Array.isArray(detections) ? detections.length : 0;
    const safeDetections = Array.isArray(detections) ? detections : [];

    const safeAvgConfidence = Number.isFinite(avgConfidence)
      ? avgConfidence
      : DetectionUtils.computeAverageConfidence(detections);

    const normalizedCategories = safeDetections.map((d) => {
      const category = d?.category ?? d?.detector?.category ?? '';
      return String(category).toLowerCase();
    });

    const antiCaptchaCount = normalizedCategories.filter((category) => {
      return category.includes('anti') || category.includes('captcha');
    }).length;

    // Fingerprint-only detections (even many of them) shouldn't imply a "hard" page.
    const fingerprintOnly = totalDetections > 0 && normalizedCategories.every((category) => {
      return category.includes('fingerprint');
    });

    const isHighTierName = (d) => {
      const name = (d?.detector?.name || d?.detector || d?.name || '').toLowerCase();
      return name.includes('shape security') ||
        name.includes('shapesecurity') ||
        name.includes('hcaptcha') ||
        name.includes('arkose') ||
        name.includes('funcaptcha');
    };

    const highTierHighConfidence = safeDetections.some((d) => {
      return isHighTierName(d) && (d?.confidence || 0) >= 80;
    });

    let heuristicDifficulty = 'Low';
    if (highTierHighConfidence) heuristicDifficulty = 'High';
    else if (fingerprintOnly) heuristicDifficulty = 'Low';
    else if (antiCaptchaCount >= 2 || totalDetections > 2 || safeAvgConfidence > 60) heuristicDifficulty = 'Medium';

    // Manual detector difficulty acts as a minimum floor for aggregate difficulty.
    const manualFloorRank = safeDetections.reduce((maxRank, detection) => {
      const manualDifficulty = DetectionUtils.normalizeDifficulty(
        detection?.difficulty || detection?.detector?.difficulty
      );
      return Math.max(maxRank, DetectionUtils.getDifficultyRank(manualDifficulty));
    }, 0);

    const heuristicRank = DetectionUtils.getDifficultyRank(heuristicDifficulty);
    return DetectionUtils.rankToDifficulty(Math.max(heuristicRank, manualFloorRank));
  }

  /**
   * Compute difficulty + default color.
   * @param {Array} detections
   * @param {number} [avgConfidence]
   * @returns {{difficulty: 'Low'|'Medium'|'High', difficultyColor: string}}
   */
  static getDifficultyInfo(detections = [], avgConfidence = undefined) {
    const difficulty = DetectionUtils.getDifficultyLevel(detections, avgConfidence);
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
