import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardIcon } from '../icons'
import { changePassword } from '../lib/authApi'
import { useAuth } from '../lib/authContext'

const MIN_LENGTH = 8

// Reached two ways: as a forced interstitial when `must_change_password` is
// set (nothing else renders until it is done), or from the user menu at any
// time. The only difference is the copy and the "back" link.
function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const forced = Boolean(user?.must_change_password)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const validate = () => {
    if (newPassword.length < MIN_LENGTH) {
      return `The new password must be at least ${MIN_LENGTH} characters.`
    }
    if (newPassword !== confirmPassword) {
      return 'The new passwords do not match.'
    }
    if (newPassword === currentPassword) {
      return 'The new password must differ from the current one.'
    }
    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (pending) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError('')
    try {
      const updated = await changePassword(currentPassword, newPassword)
      setUser(updated)
      if (forced) {
        navigate('/', { replace: true })
      } else {
        setDone(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setError(err.message || 'Could not change the password.')
    } finally {
      setPending(false)
    }
  }

  const canSubmit = currentPassword !== '' && newPassword !== '' && confirmPassword !== '' && !pending

  return (
    <main className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            <DashboardIcon width={20} height={20} />
          </span>
          <span>AI Resume Analyzer</span>
        </div>
        <h1 className="auth-title">{forced ? 'Set a new password' : 'Change password'}</h1>
        <p className="auth-subtitle">
          {forced
            ? `You are signed in as ${user?.email} with a temporary password. Choose your own before continuing.`
            : `Signed in as ${user?.email}.`}
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="current-password">{forced ? 'Temporary password' : 'Current password'}</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="form-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={pending}
            />
            <p className="field-hint">At least {MIN_LENGTH} characters.</p>
          </div>
          <div className="form-field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={pending}
            />
          </div>

          {error && (
            <p className="field-error auth-error" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="auth-success" role="status">
              Password changed.
            </p>
          )}

          <div className="auth-actions">
            <button type="submit" className="use-selected-job-button auth-submit" disabled={!canSubmit}>
              {pending ? 'Saving…' : forced ? 'Save and continue' : 'Save new password'}
            </button>
            {forced ? (
              <button type="button" className="link-button" onClick={logout}>
                Log out instead
              </button>
            ) : (
              <Link to="/" className="link-button">
                Back to dashboard
              </Link>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}

export default ChangePasswordPage
