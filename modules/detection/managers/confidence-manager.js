/**
 * ConfidenceManager - Handles confidence calculation for detections
 * Simplified: Only max confidence calculation is used
 */
class ConfidenceManager {
  constructor() {
    // Only 'max' method is used - kept for API compatibility
    this.calculationMethod = 'max';
  }

  /**
   * Calculate overall confidence from detection matches
   * Uses maximum confidence value from all matches
   * @param {Array} matches - Array of detection matches with confidence values
   * @returns {number} Overall confidence (0-100)
   */
  calculateConfidence(matches = []) {
    if (!matches || matches.length === 0) {
      return 0;
    }
    return this.calculateMaxConfidence(matches);
  }

  /**
   * Calculate maximum confidence from all matches
   * @param {Array} matches - Array of detection matches
   * @returns {number} Maximum confidence value
   */
  calculateMaxConfidence(matches) {
    let maxConfidence = 0;
    for (const match of matches) {
      if (match.confidence && match.confidence > maxConfidence) {
        maxConfidence = match.confidence;
      }
    }
    return maxConfidence;
  }
}
