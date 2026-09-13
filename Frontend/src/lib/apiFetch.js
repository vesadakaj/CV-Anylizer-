import { clearToken, getToken, notifyUnauthorized } from './session'

export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// Every API call goes through here. It adds the Bearer header and, on any
// 401, ends the session and sends the user to /login (ADR 0003: no refresh
// tokens, an expired or rejected token means logging in again).
//
// `skipAuthRedirect` is for the login request itself, whose 401 means "wrong
// credentials", not "session over".
export async function apiFetch(path, { skipAuthRedirect = false, headers, ...options } = {}) {
  const finalHeaders = new Headers(headers || {})
  const token = getToken()
  if (token && !finalHeaders.has('Authorization')) {
    finalHeaders.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: finalHeaders })

  if (response.status === 401 && !skipAuthRedirect) {
    clearToken()
    notifyUnauthorized()
  }

  return response
}

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

export async function parseJsonResponse(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(extractErrorMessage(data ?? {}))
    error.status = response.status
    throw error
  }
  // A successful response that isn't JSON almost always means the request
  // never reached the API (e.g. VITE_API_URL unset, so the Vite dev server
  // answered with index.html). Surface that instead of handing callers an
  // empty object that crashes on `data.jobs`.
  if (data === null) {
    const error = new Error(
      'The API returned a non-JSON response. Is VITE_API_URL set in Frontend/.env and the backend running?',
    )
    error.status = response.status
    throw error
  }
  return data
}

export function jsonRequest(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
