import { NavLink } from 'react-router-dom'
import { CandidatesIcon, CompareIcon, DashboardIcon, JobsIcon, LogoutIcon, UsersIcon } from '../icons'
import { useAuth } from '../lib/authContext'

const NAV_ITEMS = [
  { label: 'Dashboard', icon: DashboardIcon, to: '/' },
  { label: 'Jobs', icon: JobsIcon, to: '/jobs' },
  { label: 'Candidates', icon: CandidatesIcon, to: '/candidates' },
  { label: 'Compare', icon: CompareIcon, to: '/compare' },
  { label: 'Users', icon: UsersIcon, to: '/users', adminOnly: true },
]

function Sidebar() {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">
          <DashboardIcon width={20} height={20} />
        </span>
        <span className="sidebar-brand-text">
          AI Resume
          <br />
          Analyzer
        </span>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.filter(({ adminOnly }) => !adminOnly || isAdmin).map(({ label, icon: Icon, to }) => (
          <NavLink
            key={label}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <button type="button" className="sidebar-logout" onClick={logout}>
        <LogoutIcon />
        <span>Logout</span>
      </button>
    </aside>
  )
}

export default Sidebar
