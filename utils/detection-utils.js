/**
 * DetectionUtils - Detection confidence scoring and difficulty analysis
 */
class DetectionUtils {

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

    const safeAvgConfidence = Number.isFinite(avgConfidence)
      ? avgConfidence
      : DetectionUtils.computeAverageConfidence(detections);

    const normalizedCategories = (Array.isArray(detections) ? detections : []).map((d) => {
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

    const highTierHighConfidence = (Array.isArray(detections) ? detections : []).some((d) => {
      return isHighTierName(d) && (d?.confidence || 0) >= 80;
    });

    if (highTierHighConfidence) return 'High';
    if (fingerprintOnly) return 'Low';

    if (antiCaptchaCount >= 2 || totalDetections > 2 || safeAvgConfidence > 60) {
      return 'Medium';
    }

    return 'Low';
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DetectionUtils;
} else if (typeof window !== 'undefined') {
  window.DetectionUtils = DetectionUtils;
} else if (typeof self !== 'undefined') {
  self.DetectionUtils = DetectionUtils;
}
