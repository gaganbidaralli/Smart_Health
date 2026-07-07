/**
 * @file healthScore.js
 * @description Utility functions for mapping a numeric health score (0–100)
 * to a CSS badge class and a human-readable status label.
 */

// ─── Score Thresholds ──────────────────────────────────────────────────────────
const GOOD_THRESHOLD    = 80; // score ≥ 80 → PERFORMING WELL
const WARNING_THRESHOLD = 60; // score ≥ 60 → NEEDS ATTENTION
                               // score < 60 → INTERVENTION REQUIRED

/**
 * Returns a CSS class string for a health-score badge element.
 *
 * @param {number} score - Health score 0–100
 * @returns {'health-badge good' | 'health-badge warning' | 'health-badge critical'}
 */
export function getHealthBadgeClass(score) {
  if (score >= GOOD_THRESHOLD)    return 'health-badge good';
  if (score >= WARNING_THRESHOLD) return 'health-badge warning';
  return 'health-badge critical';
}

/**
 * Returns a short status label for a health score.
 *
 * @param {number} score - Health score 0–100
 * @returns {'PERFORMING WELL' | 'NEEDS ATTENTION' | 'INTERVENTION REQUIRED'}
 */
export function getHealthText(score) {
  if (score >= GOOD_THRESHOLD)    return 'PERFORMING WELL';
  if (score >= WARNING_THRESHOLD) return 'NEEDS ATTENTION';
  return 'INTERVENTION REQUIRED';
}
