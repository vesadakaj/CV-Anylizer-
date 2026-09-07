import { NavLink } from 'react-router-dom'
import {
  AnalyticsIcon,
  CandidatesIcon,
  DashboardIcon,
  JobsIcon,
  LogoutIcon,
  ResumesIcon,
  SettingsIcon,
} from '../icons'

const NAV_ITEMS = [
  { label: 'Dashboard', icon: DashboardIcon, to: '/' },
  { label: 'Resumes', icon: ResumesIcon, to: null },
  { label: 'Jobs', icon: JobsIcon, to: '/jobs' },
  { label: 'Candidates', icon: CandidatesIcon, to: null },
  { label: 'Analytics', icon: AnalyticsIcon, to: null },
  { label: 'Settings', icon: SettingsIcon, to: null },
]

function Sidebar() {
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
        {NAV_ITEMS.map(({ label, icon: Icon, to }) =>
          to ? (
            <NavLink
              key={label}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ) : (
            <button
              key={label}
              type="button"
              className="sidebar-nav-item"
              disabled
              title={`${label} — coming soon`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ),
        )}
      </nav>

      <button type="button" className="sidebar-logout" disabled title="Logout — not wired up yet">
        <LogoutIcon />
        <span>Logout</span>
      </button>
    </aside>
  )
}

export default Sidebar
