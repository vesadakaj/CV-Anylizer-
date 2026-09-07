const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// One CV = one request that does text extraction, NLP extraction, and
// persistence together server-side (see Backend/routers/cv.py). There is no
// server-observable "uploading" vs "extracting" phase - this call is either
// in flight or it's done.
export async function uploadCv(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/api/cv/upload`, {
    method: 'POST',
    body: formData,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.detail || 'Upload failed.')
    error.status = response.status
    throw error
  }

  return data
}
