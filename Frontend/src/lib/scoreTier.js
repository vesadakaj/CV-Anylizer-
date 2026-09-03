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
