import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchCurrentUser, login as loginRequest } from './authApi'
import { AuthContext, loginPathFor } from './authContext'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './session'

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()

  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'ready'))
  const [user, setUser] = useState(null)

  // Boot: a stored token is only trusted once /api/auth/me confirms it.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    fetchCurrentUser()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        if (!cancelled) {
          clearToken()
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Any 401 from apiFetch ends the session and sends the user to /login,
  // remembering where they were.
  useEffect(() => {
    return setUnauthorizedHandler(() => {
      setUser(null)
      if (!location.pathname.startsWith('/login')) {
        navigate(loginPathFor(location), { replace: true })
      }
    })
  }, [navigate, location])

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({ status, user, login, logout, setUser }),
    [status, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
