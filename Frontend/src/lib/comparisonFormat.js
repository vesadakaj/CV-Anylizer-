// Wording and geometry for a Comparison. The API decides every number and
// every verdict; this module only turns them into labels and bar widths, so
// the page can never claim something the scorer did not.

export const MARGIN_LABELS = {
  tie: 'Level',
  narrow: 'Narrow lead',
  clear: 'Clear lead',
  decisive: 'Decisive lead',
}

// What to call a side anywhere the two are set against each other. The API
// decides it, because "are these the same person?" is its rule to apply: two
// CVs of one candidate are told apart by their file name, not their name.
export function sideName(comparison, side) {
  if (side === 'a') return comparison.a.label || comparison.a.candidate_name
  if (side === 'b') return comparison.b.label || comparison.b.candidate_name
  return null
}

// A signed number of points, with a real minus sign and one decimal.
export function formatPoints(value) {
  if (value == null) return '—'
  const rounded = Math.abs(value) < 0.05 ? 0 : value
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(1)}`
}

export function formatScore(score) {
  return score == null ? '—' : `${Math.round(score)}%`
}

// "Ada Lovelace leads by 30.0 points", or, when there is no winner to name,
// which of the two reasons that is: no job, or a job with nothing to score.
export function verdictHeadline(comparison) {
  if (comparison.winner == null) {
    return comparison.mode === 'profile'
      ? `${sideName(comparison, 'a')} vs ${sideName(comparison, 'b')}`
      : 'No winner: this job cannot be scored'
  }
  if (comparison.winner === 'tie') {
    return `Level: both score ${formatScore(comparison.a.overall_score)}`
  }
  const leader = sideName(comparison, comparison.winner)
  return `${leader} leads by ${Math.abs(comparison.score_delta).toFixed(1)} points`
}

export function marginLabel(margin) {
  return MARGIN_LABELS[margin] || null
}

// A criterion's share of the gap, as a 0-100 width relative to the widest
// contribution in the comparison, so the widest bar always fills its half.
export function contributionWidth(value, maxAbsolute) {
  if (!maxAbsolute) return 0
  return Math.min(100, (Math.abs(value) / maxAbsolute) * 100)
}

export function maxContribution(criteria) {
  return criteria.reduce((max, row) => Math.max(max, Math.abs(row.contribution_delta)), 0)
}

// How a profile difference is called out. "none" means the two values are
// different in kind, not better or worse (field of study, languages).
export function advantageLabel(advantage, comparison) {
  if (advantage === 'none') return ''
  if (advantage === 'tie') return 'Level'
  return `${sideName(comparison, advantage)} ahead`
}
