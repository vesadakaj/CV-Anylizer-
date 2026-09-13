import { apiFetch, parseJsonResponse } from './apiFetch'

// One CV = one request that does text extraction, NLP extraction, and
// persistence together server-side (see Backend/routers/cv.py). There is no
// server-observable "uploading" vs "extracting" phase - this call is either
// in flight or it's done.
//
// With `jobId` the API also creates or updates the Application for that
// Job and scores it in the same request; the response then carries
// `application {id, status}` and the full `match`.
export async function uploadCv(file, { jobId = null } = {}) {
  const formData = new FormData()
  formData.append('file', file)
  if (jobId != null) formData.append('job_id', String(jobId))

  const response = await apiFetch('/api/cv/upload', {
    method: 'POST',
    body: formData,
  })
  return parseJsonResponse(response)
}

// The current user's CVs that no Application points at, newest first. This
// is the dashboard batch after a reload.
export async function fetchUnattachedCvs() {
  const response = await apiFetch('/api/cvs/unattached')
  return parseJsonResponse(response)
}

// One CV's Profile in the same `candidate_info` shape the upload returns,
// so Extracted Information works for rows that came from the server.
export async function fetchCv(cvId) {
  const response = await apiFetch(`/api/cvs/${cvId}`)
  return parseJsonResponse(response)
}
