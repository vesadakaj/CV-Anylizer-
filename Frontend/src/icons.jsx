// Small hand-rolled line-icon set (stroke = currentColor) so the app has no
// icon-library dependency. Every icon is a 20x20 viewBox unless noted.

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function DashboardIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.4" />
    </svg>
  )
}

export function ResumesIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 2.5h6l3 3v12a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
      <path d="M11.5 2.5v3h3" />
      <path d="M6.8 11h6.4M6.8 13.6h6.4M6.8 8.4h3" />
    </svg>
  )
}

export function JobsIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="6.5" width="15" height="10" rx="1.6" />
      <path d="M7 6.5V5a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 13 5v1.5" />
      <path d="M2.5 11h15" />
    </svg>
  )
}

export function CandidatesIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="7.3" cy="6.8" r="2.8" />
      <path d="M2.5 17c0-2.9 2.1-4.8 4.8-4.8s4.8 1.9 4.8 4.8" />
      <circle cx="14.3" cy="6.6" r="2.1" />
      <path d="M12.9 12.4c2.3.2 3.9 2 3.9 4.6" />
    </svg>
  )
}

export function AnalyticsIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 17V9M9 17V3M15 17v-6" />
      <path d="M2.5 17.5h15" />
    </svg>
  )
}

export function SettingsIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M14.9 5.1l-1.1 1.1M6.2 13.7l-1.1 1.1M14.9 14.9l-1.1-1.1M6.2 6.2 5.1 5.1" />
    </svg>
  )
}

export function LogoutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 17H4.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H8" />
      <path d="M13 13.5 17 10l-4-3.5M17 10H7.3" />
    </svg>
  )
}
