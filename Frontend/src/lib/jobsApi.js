const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// FastAPI's 422 validation errors return `detail` as an array of error
// objects, not a string - stringifying it directly renders "[object
// Object]". Every other error path already returns a plain string.
function extractErrorMessage(data) {
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return data.detail.map((item) => item.msg || JSON.stringify(item)).join(' ')
  }
  return 'Something went wrong. Please try again.'
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(extractErrorMessage(data))
    error.status = response.status
    throw error
  }
  return data
}

// Shared by the Jobs page and the Job Description analyzer's "Select
// existing job" tab, so both read from a single implementation.
export async function fetchJobs() {
  const response = await fetch(`${API_BASE}/api/jobs`)
  return parseJsonResponse(response)
}

export async function fetchJob(jobId) {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}`)
  return parseJsonResponse(response)
}

// Shared by the Dashboard's inline candidate-matches card and the standalone
// "View matches" page, so ranking-fetch logic lives in exactly one place.
export async function fetchJobMatches(jobId, { limit = 20, offset = 0 } = {}) {
  const response = await fetch(
    `${API_BASE}/api/jobs/${jobId}/matches?limit=${limit}&offset=${offset}`,
  )
  return parseJsonResponse(response)
}

// Manual, structured job creation - no NLP/LLM extraction involved.
export async function createJob(payload) {
  const response = await fetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJsonResponse(response)
}

export async function analyzeJob(description) {
  const response = await fetch(`${API_BASE}/api/jobs/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  return parseJsonResponse(response)
}

// Analyzes a pasted job posting WITHOUT persisting anything - the caller is
// expected to let the user review/correct the result, then pass it to
// createJob() to actually save it.
export async function analyzeJobPreview(description) {
  const response = await fetch(`${API_BASE}/api/jobs/analyze-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  return parseJsonResponse(response)
}
