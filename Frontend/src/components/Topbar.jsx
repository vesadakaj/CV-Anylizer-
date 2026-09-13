import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDownIcon, KeyIcon, LogoutIcon } from '../icons'
import { useAuth } from '../lib/authContext'
import { initialsFor } from '../lib/userFormat'

function Topbar() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Member'

  return (
    <header className="topbar">
      <div />
      <div className="topbar-menu" ref={menuRef}>
        <button
          type="button"
          className="topbar-user"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="topbar-avatar" aria-hidden="true">
            {initialsFor(user?.full_name)}
          </span>
          <span className="topbar-user-text">
            <strong>{user?.full_name}</strong>
            <small>{roleLabel}</small>
          </span>
          <ChevronDownIcon className="topbar-chevron" aria-hidden="true" />
        </button>

        {open && (
          <div className="topbar-dropdown" id={menuId} role="menu" aria-label="Account">
            <div className="topbar-dropdown-header">
              <strong>{user?.full_name}</strong>
              <small>{user?.email}</small>
            </div>
            <Link
              to="/change-password"
              role="menuitem"
              className="topbar-dropdown-item"
              onClick={() => setOpen(false)}
            >
              <KeyIcon width={16} height={16} aria-hidden="true" />
              <span>Change password</span>
            </Link>
            <button type="button" role="menuitem" className="topbar-dropdown-item" onClick={logout}>
              <LogoutIcon width={16} height={16} aria-hidden="true" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default Topbar
