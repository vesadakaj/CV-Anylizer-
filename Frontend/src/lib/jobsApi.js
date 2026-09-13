import { apiFetch, jsonRequest, parseJsonResponse } from './apiFetch'

// Shared by the Jobs page and the Job Description analyzer's "Select
// existing job" tab, so both read from a single implementation.
export async function fetchJobs() {
  const response = await apiFetch('/api/jobs')
  return parseJsonResponse(response)
}

export async function fetchJob(jobId) {
  const response = await apiFetch(`/api/jobs/${jobId}`)
  return parseJsonResponse(response)
}

// Shared by the Dashboard's inline candidate-matches card and the standalone
// "View matches" page, so ranking-fetch logic lives in exactly one place.
export async function fetchJobMatches(jobId, { limit = 20, offset = 0 } = {}) {
  const response = await apiFetch(`/api/jobs/${jobId}/matches?limit=${limit}&offset=${offset}`)
  return parseJsonResponse(response)
}

// Scores exactly one candidate against exactly one job - the deterministic
// individual-match endpoint, as opposed to fetchJobMatches() which ranks
// every candidate. Used by the Dashboard's single-selected-candidate match
// card so selecting a CV never triggers a full re-ranking.
export async function matchCandidateToJob(candidateId, jobId) {
  const response = await apiFetch(`/api/match/${candidateId}/${jobId}`, { method: 'POST' })
  return parseJsonResponse(response)
}

// Manual, structured job creation - no NLP/LLM extraction involved.
export async function createJob(payload) {
  const response = await apiFetch('/api/jobs', jsonRequest('POST', payload))
  return parseJsonResponse(response)
}

export async function analyzeJob(description) {
  const response = await apiFetch('/api/jobs/analyze', jsonRequest('POST', { description }))
  return parseJsonResponse(response)
}

// Analyzes a pasted job posting WITHOUT persisting anything - the caller is
// expected to let the user review/correct the result, then pass it to
// createJob() to actually save it.
export async function analyzeJobPreview(description) {
  const response = await apiFetch('/api/jobs/analyze-preview', jsonRequest('POST', { description }))
  return parseJsonResponse(response)
}
