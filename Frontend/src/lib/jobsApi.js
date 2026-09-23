import { apiFetch, jsonRequest, parseJsonResponse } from './apiFetch'

// Shared by the Jobs page and the Job Description card's "Select existing
// job" tab, so both read from a single implementation.
export async function fetchJobs() {
  const response = await apiFetch('/api/jobs')
  return parseJsonResponse(response)
}

export async function fetchJob(jobId) {
  const response = await apiFetch(`/api/jobs/${jobId}`)
  return parseJsonResponse(response)
}

// A Job's Applications ranked by stored score. Summary rows only; the
// breakdown of one Application is `fetchApplicationMatch`.
export async function fetchJobMatches(jobId, { limit = 20, offset = 0 } = {}) {
  const response = await apiFetch(`/api/jobs/${jobId}/matches?limit=${limit}&offset=${offset}`)
  return parseJsonResponse(response)
}

// Scores a batch of CVs against one Job: one Application per CV, created
// or updated, each returned with its match. This is the dashboard's
// "Score N CVs against <job>" action.
export async function scoreCvsAgainstJob(jobId, cvIds) {
  const response = await apiFetch(
    `/api/jobs/${jobId}/applications`,
    jsonRequest('POST', { cv_ids: cvIds }),
  )
  return parseJsonResponse(response)
}

// The full breakdown and explanation of one Application's score.
export async function fetchApplicationMatch(applicationId) {
  const response = await apiFetch(`/api/applications/${applicationId}/match`)
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
