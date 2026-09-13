import { useEffect, useId, useState } from 'react'
import { CopyIcon, PlusIcon } from '../icons'
import { useAuth } from '../lib/authContext'
import { formatDateTime } from '../lib/userFormat'
import { createUser, fetchUsers, resetUserPassword, updateUser } from '../lib/usersApi'

const MIN_PASSWORD_LENGTH = 8
// No 0/O, 1/l/I: the admin reads this out or pastes it into a message.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function generatePassword(length = 12) {
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  return Array.from(values, (v) => PASSWORD_ALPHABET[v % PASSWORD_ALPHABET.length]).join('')
}

function Modal({ title, onClose, children }) {
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 className="card-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="page-banner-dismiss" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// The temporary password is shown exactly once, here. After the dialog
// closes there is no way to see it again; the admin resets it instead.
function TemporaryPasswordReveal({ password, email, onDone }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="reveal">
      <p className="reveal-intro">
        Share this temporary password with <strong>{email}</strong>. It is shown only once; they will be
        asked to choose their own password at first sign-in.
      </p>
      <div className="reveal-row">
        <code className="reveal-password">{password}</code>
        <button type="button" className="table-action-button" onClick={copy}>
          <CopyIcon width={14} height={14} aria-hidden="true" />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="form-actions">
        <button type="button" className="use-selected-job-button" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

function TemporaryPasswordField({ id, value, onChange, disabled }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>Temporary password</label>
      <div className="skill-input-row">
        <input
          id={id}
          type="text"
          autoComplete="off"
          spellCheck="false"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="table-action-button"
          onClick={() => onChange(generatePassword())}
          disabled={disabled}
        >
          Generate
        </button>
      </div>
      <p className="field-hint">At least {MIN_PASSWORD_LENGTH} characters. The user must change it at first sign-in.</p>
    </div>
  )
}

function CreateUserDialog({ onClose, onCreated }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('member')
  const [temporaryPassword, setTemporaryPassword] = useState(() => generatePassword())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`The temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setPending(true)
    setError('')
    try {
      const user = await createUser({ email: email.trim(), fullName: fullName.trim(), role, temporaryPassword })
      onCreated(user)
      setCreated(user)
    } catch (err) {
      setError(err.message || 'Could not create the user.')
    } finally {
      setPending(false)
    }
  }

  const canSubmit = email.trim() !== '' && fullName.trim() !== '' && temporaryPassword !== '' && !pending

  return (
    <Modal title={created ? 'User created' : 'Create user'} onClose={onClose}>
      {created ? (
        <TemporaryPasswordReveal password={temporaryPassword} email={created.email} onDone={onClose} />
      ) : (
        <form className="job-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="create-user-name">Full name</label>
            <input
              id="create-user-name"
              type="text"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="form-field">
            <label htmlFor="create-user-email">Email</label>
            <input
              id="create-user-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="form-field">
            <label htmlFor="create-user-role">Role</label>
            <select id="create-user-role" value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p className="field-hint">Admins can also create, deactivate and reset users. Nothing else differs.</p>
          </div>
          <TemporaryPasswordField
            id="create-user-password"
            value={temporaryPassword}
            onChange={setTemporaryPassword}
            disabled={pending}
          />

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="use-selected-job-button" disabled={!canSubmit}>
              {pending ? 'Creating…' : 'Create user'}
            </button>
            <button type="button" className="table-action-button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function ResetPasswordDialog({ user, onClose, onReset }) {
  const [temporaryPassword, setTemporaryPassword] = useState(() => generatePassword())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`The temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setPending(true)
    setError('')
    try {
      const updated = await resetUserPassword(user.id, temporaryPassword)
      onReset(updated)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not reset the password.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal title={done ? 'Password reset' : `Reset password for ${user.full_name}`} onClose={onClose}>
      {done ? (
        <TemporaryPasswordReveal password={temporaryPassword} email={user.email} onDone={onClose} />
      ) : (
        <form className="job-form" onSubmit={handleSubmit} noValidate>
          <p className="field-hint">
            Their current password stops working immediately. They sign in with the temporary one and are
            asked to choose a new password.
          </p>
          <TemporaryPasswordField
            id="reset-user-password"
            value={temporaryPassword}
            onChange={setTemporaryPassword}
            disabled={pending}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="submit"
              className="use-selected-job-button"
              disabled={temporaryPassword === '' || pending}
            >
              {pending ? 'Resetting…' : 'Reset password'}
            </button>
            <button type="button" className="table-action-button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

const COLUMNS = ['Name', 'Email', 'Role', 'Status', 'Last login', 'Actions']

function UsersPage() {
  const { user: me } = useAuth()

  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')
  const [users, setUsers] = useState([])
  const [banner, setBanner] = useState(null) // { kind: 'success' | 'error', text }
  const [dialog, setDialog] = useState(null) // { kind: 'create' } | { kind: 'reset', user }
  const [busyUserId, setBusyUserId] = useState(null)

  const loadUsers = () => {
    setStatus('loading')
    setErrorMessage('')
    fetchUsers()
      .then((data) => {
        setUsers(data)
        setStatus('success')
      })
      .catch((err) => {
        setErrorMessage(err.message)
        setStatus('error')
      })
  }

  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const replaceUser = (updated) =>
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)))

  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.is_active).length

  // Mirrors the API's guards so a refused action is never offered. The
  // title explains why, since a silently disabled button is a mystery.
  const guardFor = (target) => {
    if (target.id === me?.id) {
      return 'You cannot deactivate or demote your own account.'
    }
    if (target.role === 'admin' && target.is_active && activeAdminCount <= 1) {
      return 'This is the last active admin. Promote another user first.'
    }
    return ''
  }

  const applyChange = async (target, changes, successText) => {
    setBusyUserId(target.id)
    setBanner(null)
    try {
      const updated = await updateUser(target.id, changes)
      replaceUser(updated)
      setBanner({ kind: 'success', text: successText })
    } catch (err) {
      setBanner({ kind: 'error', text: err.message })
    } finally {
      setBusyUserId(null)
    }
  }

  const hasUsers = users.length > 0

  return (
    <main className="page-container">
      {banner && (
        <div className={`page-banner ${banner.kind}`} role={banner.kind === 'error' ? 'alert' : 'status'}>
          <span>{banner.text}</span>
          <button
            type="button"
            className="page-banner-dismiss"
            aria-label="Dismiss message"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Everyone with a login. Users are deactivated, never deleted.</p>
        </div>
        <div className="page-header-controls">
          <button type="button" className="create-job-button" onClick={() => setDialog({ kind: 'create' })}>
            <PlusIcon width={16} height={16} aria-hidden="true" />
            <span>Create user</span>
          </button>
        </div>
      </div>

      <div className="card jobs-table-card">
        <div aria-live="polite">
          {status === 'loading' && (
            <div className="table-scroll">
              <table className="jobs-table" aria-busy="true">
                <caption className="visually-hidden">Loading users…</caption>
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {COLUMNS.map((column) => (
                        <td key={column}>
                          <span className="skeleton-bar" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {status === 'error' && (
            <div className="table-empty-state">
              <p className="upload-message error">{errorMessage}</p>
              <button type="button" className="use-selected-job-button" onClick={loadUsers}>
                Retry
              </button>
            </div>
          )}

          {status === 'success' && !hasUsers && (
            <div className="table-empty-state">
              <p className="empty-hint">No users yet.</p>
            </div>
          )}

          {status === 'success' && hasUsers && (
            <div className="table-scroll">
              <table className="jobs-table users-table">
                <caption className="visually-hidden">Users and their roles</caption>
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const guard = guardFor(u)
                    const busy = busyUserId === u.id
                    const isAdmin = u.role === 'admin'
                    return (
                      <tr key={u.id} className={u.is_active ? '' : 'users-row-inactive'}>
                        <td className="jobs-table-title">
                          {u.full_name}
                          {u.id === me?.id && <span className="users-you"> (you)</span>}
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <span className={`pill ${isAdmin ? 'pill-warning' : 'pill-neutral'}`}>
                            {isAdmin ? 'Admin' : 'Member'}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${u.is_active ? 'pill-success' : 'pill-neutral'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {u.must_change_password && u.is_active && (
                            <span className="users-flag" title="Signed in with a temporary password not yet changed">
                              Temporary password
                            </span>
                          )}
                        </td>
                        <td>{formatDateTime(u.last_login_at)}</td>
                        <td>
                          <div className="jobs-row-actions">
                            {u.is_active ? (
                              <button
                                type="button"
                                className="table-action-button"
                                disabled={busy || Boolean(guard)}
                                title={guard || undefined}
                                onClick={() =>
                                  applyChange(u, { is_active: false }, `${u.full_name} has been deactivated.`)
                                }
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="table-action-button"
                                disabled={busy}
                                onClick={() =>
                                  applyChange(u, { is_active: true }, `${u.full_name} has been reactivated.`)
                                }
                              >
                                Reactivate
                              </button>
                            )}
                            {isAdmin ? (
                              <button
                                type="button"
                                className="table-action-button"
                                disabled={busy || Boolean(guard)}
                                title={guard || undefined}
                                onClick={() =>
                                  applyChange(u, { role: 'member' }, `${u.full_name} is now a member.`)
                                }
                              >
                                Make member
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="table-action-button"
                                disabled={busy}
                                onClick={() =>
                                  applyChange(u, { role: 'admin' }, `${u.full_name} is now an admin.`)
                                }
                              >
                                Make admin
                              </button>
                            )}
                            <button
                              type="button"
                              className="table-action-button"
                              disabled={busy}
                              onClick={() => setDialog({ kind: 'reset', user: u })}
                            >
                              Reset password
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {dialog?.kind === 'create' && (
        <CreateUserDialog
          onClose={() => setDialog(null)}
          onCreated={(created) => {
            setUsers((list) => [...list, created].sort((a, b) => a.full_name.localeCompare(b.full_name)))
            setBanner({ kind: 'success', text: `${created.full_name} has been created.` })
          }}
        />
      )}
      {dialog?.kind === 'reset' && (
        <ResetPasswordDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onReset={(updated) => {
            replaceUser(updated)
            setBanner({ kind: 'success', text: `Password reset for ${updated.full_name}.` })
          }}
        />
      )}
    </main>
  )
}

export default UsersPage
