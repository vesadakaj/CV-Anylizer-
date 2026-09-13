import { apiFetch, jsonRequest, parseJsonResponse } from './apiFetch'

export async function fetchCandidates({ search = '', limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (search.trim()) params.set('search', search.trim())
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  const response = await apiFetch(`/api/candidates?${params.toString()}`)
  return parseJsonResponse(response)
}

export async function fetchCandidate(candidateId) {
  const response = await apiFetch(`/api/candidates/${candidateId}`)
  return parseJsonResponse(response)
}

// "Add this Candidate to a Job", scored from `cvId` or, by default, their
// newest CV. When the Candidate already has an Application for that Job the
// API repoints it and answers with status "updated".
export async function addCandidateToJob(candidateId, { jobId, cvId = null }) {
  const body = { job_id: jobId }
  if (cvId != null) body.cv_id = cvId
  const response = await apiFetch(
    `/api/candidates/${candidateId}/applications`,
    jsonRequest('POST', body),
  )
  return parseJsonResponse(response)
}
