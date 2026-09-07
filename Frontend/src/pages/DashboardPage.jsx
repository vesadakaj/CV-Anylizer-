import { useState } from 'react'
import UploadResume from '../components/UploadResume'
import RecentUploads from '../components/RecentUploads'
import ExtractedInfo from '../components/ExtractedInfo'
import JobDescription from '../components/JobDescription'
import CandidateMatches from '../components/CandidateMatches'
import MatchingFactors from '../components/MatchingFactors'

function DashboardPage() {
  const [lastCandidate, setLastCandidate] = useState(null)
  const [recentUploads, setRecentUploads] = useState([])
  const [job, setJob] = useState({ id: null, info: null })
  const [topCandidate, setTopCandidate] = useState(null)

  const handleUploaded = (data) => {
    setLastCandidate(data.candidate_info)
    setRecentUploads((prev) => [
      { id: data.candidate_id, filename: data.filename, uploadedAt: Date.now() },
      ...prev,
    ].slice(0, 5))
  }

  const handleJobAnalyzed = (jobId, jobInfo) => {
    setJob({ id: jobId, info: jobInfo })
    if (!jobId) setTopCandidate(null)
  }

  return (
    <main className="dashboard-grid">
      <UploadResume onUploaded={handleUploaded} />
      <RecentUploads uploads={recentUploads} />

      <ExtractedInfo candidate={lastCandidate} />
      <CandidateMatches
        jobId={job.id}
        jobTitle={job.info?.title}
        onTopCandidateChange={setTopCandidate}
      />

      <JobDescription jobInfo={job.info} onAnalyzed={handleJobAnalyzed} />
      <MatchingFactors candidate={topCandidate} />
    </main>
  )
}

export default DashboardPage
