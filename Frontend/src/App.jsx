import { Link, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'
import JobMatchesPage from './pages/JobMatchesPage'
import CreateJobPage from './pages/CreateJobPage'
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

function App() {
  return (
    <div id="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/new" element={<CreateJobPage />} />
          <Route path="/jobs/:jobId/matches" element={<JobMatchesPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
