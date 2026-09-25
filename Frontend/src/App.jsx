import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'
import JobMatchesPage from './pages/JobMatchesPage'
import CreateJobPage from './pages/CreateJobPage'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import UsersPage from './pages/UsersPage'
import CandidatesPage from './pages/CandidatesPage'
import CandidateDetailPage from './pages/CandidateDetailPage'
import ComparePage from './pages/ComparePage'
import { loginPathFor } from './lib/authContext'
import { useAuth } from './lib/authContext'
import './App.css'

function NotFoundPage() {
  return (
    <main className="page-container">
      <div className="card">
        <h1 className="page-title">Page not found</h1>
        <p className="empty-hint">The page you're looking for doesn't exist.</p>
        <Link to="/" className="use-selected-job-button">
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}

// Everything except /login sits behind this. While the stored token is being
// confirmed nothing renders, so a protected page never flashes for a user
// who is about to be sent to /login. A user who must change their password
// sees only that page until it is done.
function RequireAuth({ children }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="auth-loading" role="status">
        Loading…
      </div>
    )
  }
  if (!user) {
    return <Navigate to={loginPathFor(location)} replace />
  }
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return children
}

// Members get the same not-found page as a URL that does not exist, so the
// Users page is not advertised to them.
function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <NotFoundPage />
  return children
}

function AppShell() {
  return (
    <div id="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <Outlet />
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/new" element={<CreateJobPage />} />
        <Route path="/jobs/:jobId/matches" element={<JobMatchesPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        <Route path="/candidates" element={<CandidatesPage />} />
        <Route path="/candidates/:candidateId" element={<CandidateDetailPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
