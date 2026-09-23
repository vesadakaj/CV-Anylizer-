export function initialsFor(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

// The API serialises naive UTC datetimes without a zone suffix; treat those
// as UTC so they render in the viewer's local time.
export function parseServerDate(value) {
  if (!value) return null
  const text = String(value)
  const date = new Date(text.endsWith('Z') || /[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value) {
  if (!value) return 'Never'
  const date = parseServerDate(value)
  if (!date) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
