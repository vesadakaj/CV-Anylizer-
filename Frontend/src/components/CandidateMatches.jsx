import { useEffect, useState } from 'react'
import { initials, scoreTierClass } from '../lib/scoreTier'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const TOP_COUNT = 5

function CandidateMatches({ jobId, jobTitle, onTopCandidateChange }) {
  const [status, setStatus] = useState('idle') // idle | loading | error | success
  const [message, setMessage] = useState('')
  const [topMatches, setTopMatches] = useState([])

  useEffect(() => {
    if (!jobId) {
      setTopMatches([])
      onTopCandidateChange?.(null)
      return
    }

    setStatus('loading')
    setMessage('')

    fetch(`${API_BASE}/api/jobs/${jobId}/matches?limit=${TOP_COUNT}&offset=0`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Could not load candidate matches.')
        setTopMatches(data.candidates)
        onTopCandidateChange?.(data.candidates[0] || null)
        setStatus('success')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.message)
        onTopCandidateChange?.(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return (
    <section className="card matches-card">
      <div className="card-header-row">
        <h2 className="card-title">Candidate Match Results</h2>
      </div>

      {!jobId && (
        <p className="empty-hint">Analyze a job description to rank uploaded candidates against it.</p>
      )}

      {jobId && status === 'loading' && <p className="empty-hint">Loading matches…</p>}
      {jobId && status === 'error' && <p className="upload-message error">{message}</p>}

      {jobId && status === 'success' && (
        topMatches.length === 0 ? (
          <p className="empty-hint">No candidates uploaded yet for "{jobTitle}".</p>
        ) : (
          <ol className="match-list">
            {topMatches.map((candidate) => (
              <li key={candidate.candidate_id} className="match-item">
                <span className={`match-rank${candidate.rank === 1 ? ' first' : ''}`}>
                  {candidate.rank}
                </span>
                <span className="match-avatar">{initials(candidate.candidate_name)}</span>
                <div className="match-info">
                  <p className="match-name">{candidate.candidate_name}</p>
                  <p className="match-subtitle">
                    {candidate.status === 'scored'
                      ? `${candidate.matched_required_skills_count}/${candidate.total_required_skills} skills matched`
                      : 'Not enough data to score'}
                  </p>
                  <div className="match-bar-track">
                    <div
                      className={`match-bar-fill ${scoreTierClass(candidate.overall_score)}`}
                      style={{ width: `${candidate.overall_score ?? 0}%` }}
                    />
                  </div>
                </div>
                <div className="match-score">
                  {candidate.status === 'scored' ? (
                    <>
                      <strong>{Math.round(candidate.overall_score)}%</strong>
                      <span>Match</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )
      )}
    </section>
  )
}

export default CandidateMatches
