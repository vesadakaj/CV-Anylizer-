import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DashboardIcon } from '../icons'
import { safeNextPath, useAuth } from '../lib/authContext'

const LOGIN_ERROR = 'Email or password is incorrect.'

function LoginPage() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const next = safeNextPath(new URLSearchParams(location.search).get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  if (status === 'loading') {
    return (
      <div className="auth-loading" role="status">
        Loading…
      </div>
    )
  }
  if (user) {
    return <Navigate to={next} replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      await login(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      // 401 is the only "expected" failure and its message is deliberately
      // the same for unknown, wrong and inactive accounts. Anything else
      // (network, 5xx) is shown as it comes so the user knows it is not them.
      setError(err.status === 401 ? LOGIN_ERROR : err.message || LOGIN_ERROR)
    } finally {
      setPending(false)
    }
  }

  const canSubmit = email.trim() !== '' && password !== '' && !pending

  return (
    <main className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            <DashboardIcon width={20} height={20} />
          </span>
          <span>AI Resume Analyzer</span>
        </div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-subtitle">Use the email and password your admin gave you.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
          </div>

          {error && (
            <p className="field-error auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="use-selected-job-button auth-submit" disabled={!canSubmit}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default LoginPage
