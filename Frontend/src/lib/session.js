// The one place the session token lives. Kept free of React so apiFetch can
// read it without a hook, and so AuthProvider and apiFetch share no import
// cycle.

const TOKEN_KEY = 'cv-analyzer-token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Private mode or blocked storage: the session still works for this
    // page load, it just will not survive a reload.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // nothing to clear
  }
}

// AuthProvider registers a handler that drops the user and navigates to
// /login. Outside the provider (component tests) a 401 just clears the token.
let unauthorizedHandler = null

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

export function notifyUnauthorized() {
  if (unauthorizedHandler) unauthorizedHandler()
}
