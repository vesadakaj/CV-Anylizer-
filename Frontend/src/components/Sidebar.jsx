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
  { label: 'Dashboard', icon: DashboardIcon, active: true },
  { label: 'Resumes', icon: ResumesIcon, active: false },
  { label: 'Jobs', icon: JobsIcon, active: false },
  { label: 'Candidates', icon: CandidatesIcon, active: false },
  { label: 'Analytics', icon: AnalyticsIcon, active: false },
  { label: 'Settings', icon: SettingsIcon, active: false },
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

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            type="button"
            className={`sidebar-nav-item${active ? ' active' : ''}`}
            disabled={!active}
            title={active ? undefined : `${label} — coming soon`}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button type="button" className="sidebar-logout" disabled title="Logout — not wired up yet">
        <LogoutIcon />
        <span>Logout</span>
      </button>
    </aside>
  )
}

export default Sidebar
