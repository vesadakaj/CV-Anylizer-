import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.')
  }
  return value
}

// Builds the /login URL that brings the user back to where they were.
export function loginPathFor(location) {
  const current = `${location.pathname}${location.search}`
  if (current === '/' || current.startsWith('/login')) return '/login'
  return `/login?next=${encodeURIComponent(current)}`
}

// Only same-app paths are honoured as a post-login destination, never a
// full URL, so a crafted link cannot bounce a user to another site.
export function safeNextPath(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}
