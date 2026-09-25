import { apiFetch, parseJsonResponse } from './apiFetch'

// Two CVs head to head. With `jobId` both are scored against that Job and
// the gap is attributed to its criteria; without one the API answers with a
// profile-only diff. Nothing is created or rescored by this call.
export async function fetchComparison({ cvA, cvB, jobId = null }) {
  const params = new URLSearchParams({ cv_a: String(cvA), cv_b: String(cvB) })
  if (jobId != null && jobId !== '') params.set('job_id', String(jobId))
  const response = await apiFetch(`/api/comparisons?${params.toString()}`)
  return parseJsonResponse(response)
}
