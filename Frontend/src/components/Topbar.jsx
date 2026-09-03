import { ChevronDownIcon } from '../icons'

function Topbar() {
  return (
    <header className="topbar">
      <div />
      <div className="topbar-user">
        <span className="topbar-avatar" aria-hidden="true">
          HR
        </span>
        <span className="topbar-user-text">
          <strong>HR Manager</strong>
          <small>Reviewing candidates</small>
        </span>
        <ChevronDownIcon className="topbar-chevron" />
      </div>
    </header>
  )
}

export default Topbar
