export function scoreTierClass(score) {
  if (score == null) return 'tier-unknown'
  if (score >= 70) return 'tier-good'
  if (score >= 40) return 'tier-mid'
  return 'tier-low'
}

export function scoreLabel(score) {
  if (score == null) return 'Unscored'
  if (score >= 85) return 'Excellent'
  if (score >= 65) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Weak'
}

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

// Defensive UI-only clamp for progress-bar width - the backend already
// produces scores in [0, 100], but visual rendering must never overflow or
// go negative even if a value is missing or out of range.
export function clampPercent(score) {
  if (score == null || Number.isNaN(score)) return 0
  return Math.max(0, Math.min(100, score))
}
