import { apiFetch, jsonRequest, parseJsonResponse } from './apiFetch'

// Admin-only endpoints; the API answers 403 for Members and 409 for changes
// that would remove the last active Admin or touch the caller's own role or
// status. The Users page disables those actions up front and relies on the
// message from the API for everything else.

export async function fetchUsers() {
  const response = await apiFetch('/api/users')
  return parseJsonResponse(response)
}

export async function createUser({ email, fullName, role, temporaryPassword }) {
  const response = await apiFetch(
    '/api/users',
    jsonRequest('POST', {
      email,
      full_name: fullName,
      role,
      temporary_password: temporaryPassword,
    }),
  )
  return parseJsonResponse(response)
}

export async function updateUser(userId, changes) {
  const response = await apiFetch(`/api/users/${userId}`, jsonRequest('PATCH', changes))
  return parseJsonResponse(response)
}

export async function resetUserPassword(userId, temporaryPassword) {
  const response = await apiFetch(
    `/api/users/${userId}/reset-password`,
    jsonRequest('POST', { temporary_password: temporaryPassword }),
  )
  return parseJsonResponse(response)
}
