import { useCallback, useState } from 'react'
import UploadResume from '../components/UploadResume'
import RecentUploads from '../components/RecentUploads'
import ExtractedInfo from '../components/ExtractedInfo'
import JobDescription from '../components/JobDescription'
import CandidateMatches from '../components/CandidateMatches'
import MatchingFactors from '../components/MatchingFactors'
import { useCvUploadQueue } from '../lib/useCvUploadQueue'

function DashboardPage() {
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [job, setJob] = useState({ id: null, info: null })
  const [matchResult, setMatchResult] = useState(null)

  // A newly-Ready CV is only auto-selected when nothing has been selected
  // yet - once any selection exists (auto or manual), later completions
  // never override it.
  const handleReady = useCallback((_localId, data) => {
    setSelectedCandidateId((prev) => (prev == null ? data.candidate_id : prev))
  }, [])

  const { items, isProcessing, addFiles, retry } = useCvUploadQueue({ onReady: handleReady })

  const selectedItem = items.find((item) => item.candidateId === selectedCandidateId) || null
  const selectedCandidate = selectedItem?.candidateInfo || null

  const handleSelect = (item) => {
    if (item.status !== 'ready') return
    setSelectedCandidateId(item.candidateId)
  }

  const handleJobAnalyzed = (jobId, jobInfo) => {
    setJob({ id: jobId, info: jobInfo })
  }

  return (
    <main className="dashboard-grid">
      <UploadResume isProcessing={isProcessing} onFilesSelected={addFiles} />
      <RecentUploads
        items={items}
        selectedCandidateId={selectedCandidateId}
        isProcessing={isProcessing}
        onSelect={handleSelect}
        onRetry={retry}
      />

      <ExtractedInfo candidate={selectedCandidate} />
      <CandidateMatches
        candidateId={selectedCandidateId}
        candidateName={selectedCandidate?.full_name}
        jobId={job.id}
        jobTitle={job.info?.title}
        onMatchResultChange={setMatchResult}
      />

      <JobDescription jobInfo={job.info} onAnalyzed={handleJobAnalyzed} />
      <MatchingFactors candidate={matchResult} />
    </main>
  )
}

export default DashboardPage
