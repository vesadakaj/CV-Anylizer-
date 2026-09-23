import { apiFetch, jsonRequest, parseJsonResponse } from './apiFetch'

export async function login(email, password) {
  const response = await apiFetch('/api/auth/login', {
    ...jsonRequest('POST', { email, password }),
    skipAuthRedirect: true,
  })
  return parseJsonResponse(response)
}

export async function fetchCurrentUser() {
  const response = await apiFetch('/api/auth/me')
  return parseJsonResponse(response)
}

export async function changePassword(currentPassword, newPassword) {
  const response = await apiFetch(
    '/api/auth/change-password',
    jsonRequest('POST', { current_password: currentPassword, new_password: newPassword }),
  )
  return parseJsonResponse(response)
}
