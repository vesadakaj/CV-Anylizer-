export function formatExperience(years) {
  if (years == null) return 'Not specified'
  const rounded = Number.isInteger(years) ? years : Math.round(years * 10) / 10
  return `${rounded}+ years`
}

export function formatDate(isoString) {
  if (!isoString) return 'Not specified'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return 'Not specified'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const EDUCATION_OPTIONS = ['Not specified', 'High School', 'Bachelor', 'Master', 'PhD']

// Maps free-text education extracted by the NLP service (e.g. "Bachelor's
// degree in Computer Science") onto the fixed options the deterministic
// matching hierarchy understands. Falls back to "Not specified" rather than
// inventing a level that isn't clearly supported by the text.
export function normalizeEducationOption(text) {
  if (!text) return 'Not specified'
  const lower = text.toLowerCase()
  if (lower.includes('phd') || lower.includes('doctor')) return 'PhD'
  if (lower.includes('master')) return 'Master'
  if (lower.includes('bachelor')) return 'Bachelor'
  if (lower.includes('high school')) return 'High School'
  return 'Not specified'
}

export { EDUCATION_OPTIONS }

// Local (not UTC) today as YYYY-MM-DD, for defaulting <input type="date"> values.
export function todayLocalISODate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
