import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import UploadResume from './components/UploadResume'
import RecentUploads from './components/RecentUploads'
import './App.css'

function App() {
  const [lastCandidate, setLastCandidate] = useState(null)
  const [recentUploads, setRecentUploads] = useState([])

  const handleUploaded = (data) => {
    setLastCandidate(data.candidate_info)
    setRecentUploads((prev) => [
      { id: data.candidate_id, filename: data.filename, uploadedAt: Date.now() },
      ...prev,
    ].slice(0, 5))
  }

  return (
    <div id="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <main className="dashboard-grid">
          <UploadResume onUploaded={handleUploaded} />
          <RecentUploads uploads={recentUploads} />
        </main>
      </div>
    </div>
  )
}

export default App
