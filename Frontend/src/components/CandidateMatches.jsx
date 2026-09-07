import { useEffect, useState } from 'react'
import { matchCandidateToJob } from '../lib/jobsApi'
import { scoreTierClass } from '../lib/scoreTier'

// Scores exactly the selected candidate against the current job - never the
// all-candidates ranking endpoint. Selecting a different candidate or job
// clears any previous result immediately so a stale score is never shown.
function CandidateMatches({ candidateId, candidateName, jobId, jobTitle, onMatchResultChange }) {
  const [status, setStatus] = useState('idle') // idle | loading | error | success
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    setResult(null)
    setMessage('')
    onMatchResultChange?.(null)

    if (!candidateId || !jobId) {
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')

    matchCandidateToJob(candidateId, jobId)
      .then((data) => {
        if (cancelled) return
        setResult(data)
        onMatchResultChange?.(data)
        setStatus('success')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus('error')
        setMessage(err.message)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, jobId])

  return (
    <section className="card matches-card">
      <div className="card-header-row">
        <h2 className="card-title">Candidate Match Results</h2>
      </div>

      {!candidateId && (
        <p className="empty-hint">Select a completed CV before matching it to a job.</p>
      )}

      {candidateId && !jobId && (
        <p className="empty-hint">
          Analyze a job description to match this candidate against it.
        </p>
      )}

      {candidateId && jobId && status === 'loading' && (
        <p className="empty-hint">Matching…</p>
      )}

      {candidateId && jobId && status === 'error' && (
        <p className="upload-message error" role="alert">
          {message}
        </p>
      )}

      {candidateId && jobId && status === 'success' && result && (
        <div className="single-match-result">
          <div className="single-match-header">
            <span className="single-match-name">{candidateName || result.candidate_name}</span>
            <span className="single-match-job">vs {jobTitle || result.job_title}</span>
          </div>

          {result.status === 'scored' ? (
            <>
              <div className="match-bar-track">
                <div
                  className={`match-bar-fill ${scoreTierClass(result.overall_score)}`}
                  style={{ width: `${Math.max(0, Math.min(100, result.overall_score ?? 0))}%` }}
                />
              </div>
              <p className="single-match-score">{Math.round(result.overall_score)}% match</p>
            </>
          ) : (
            <p className="empty-hint">
              This job doesn't have enough structured requirements to score this match.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export default CandidateMatches
