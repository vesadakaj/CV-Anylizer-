import { useEffect, useState } from 'react'
import { initials, scoreTierClass } from '../lib/scoreTier'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const TOP_COUNT = 5
const PAGE_SIZE = 10

function CandidateMatches({ jobId, jobTitle, onTopCandidateChange }) {
  const [status, setStatus] = useState('idle') // idle | loading | error | success
  const [message, setMessage] = useState('')
  const [topMatches, setTopMatches] = useState([])
  const [totalCandidates, setTotalCandidates] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [fullRanking, setFullRanking] = useState(null)
  const [offset, setOffset] = useState(0)
  const [fullStatus, setFullStatus] = useState('idle')

  useEffect(() => {
    if (!jobId) {
      setTopMatches([])
      setTotalCandidates(0)
      setExpanded(false)
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
        setTotalCandidates(data.total_candidates)
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

  const loadFullPage = (requestedOffset) => {
    if (!jobId) return
    setFullStatus('loading')

    fetch(`${API_BASE}/api/jobs/${jobId}/matches?limit=${PAGE_SIZE}&offset=${requestedOffset}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Could not load candidate matches.')
        setFullRanking(data)
        setOffset(requestedOffset)
        setFullStatus('success')
      })
      .catch((err) => {
        setFullStatus('error')
        setMessage(err.message)
      })
  }

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    if (next && !fullRanking) {
      loadFullPage(0)
    }
  }

  return (
    <section className="card matches-card">
      <div className="card-header-row">
        <h2 className="card-title">Candidate Match Results</h2>
        {totalCandidates > 0 && (
          <button type="button" className="link-button" onClick={toggleExpanded}>
            {expanded ? 'Hide details' : 'See details'}
          </button>
        )}
      </div>

      {!jobId && (
        <p className="empty-hint">Analyze a job description to rank uploaded candidates against it.</p>
      )}

      {jobId && status === 'loading' && <p className="empty-hint">Loading matches…</p>}
      {jobId && status === 'error' && <p className="upload-message error">{message}</p>}

      {jobId && status === 'success' && (
        <>
          {topMatches.length === 0 ? (
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
          )}

          {totalCandidates > TOP_COUNT && (
            <button type="button" className="view-full-button" onClick={toggleExpanded}>
              {expanded ? 'Hide Full Comparison' : 'View Full Comparison'}
            </button>
          )}
        </>
      )}

      {expanded && (
        <div className="full-ranking">
          {fullStatus === 'loading' && !fullRanking && <p className="empty-hint">Loading…</p>}
          {fullStatus === 'error' && <p className="upload-message error">{message}</p>}

          {fullRanking && (
            <>
              <ul className="ranking-list">
                {fullRanking.candidates.map((candidate) => (
                  <li key={candidate.candidate_id} className="ranking-item">
                    <div className="ranking-item-header">
                      <span className="rank-badge">#{candidate.rank}</span>
                      <span className="candidate-name">{candidate.candidate_name}</span>
                      {candidate.status === 'scored' ? (
                        <span className="overall-score">{candidate.overall_score.toFixed(2)}% match</span>
                      ) : (
                        <span className="overall-score unscorable">Not scorable</span>
                      )}
                    </div>

                    {candidate.status === 'scored' && (
                      <div className="component-scores">
                        {candidate.available_criteria.includes('skills') && (
                          <span>Skills: {candidate.skill_score.toFixed(2)}%</span>
                        )}
                        {candidate.available_criteria.includes('experience') && (
                          <span>Experience: {candidate.experience_score.toFixed(2)}%</span>
                        )}
                        {candidate.available_criteria.includes('education') && (
                          <span>Education: {candidate.education_score.toFixed(2)}%</span>
                        )}
                      </div>
                    )}

                    <p className="explanation">{candidate.explanation}</p>
                  </li>
                ))}
              </ul>

              <div className="pagination">
                <button
                  type="button"
                  disabled={offset === 0 || fullStatus === 'loading'}
                  onClick={() => loadFullPage(Math.max(offset - PAGE_SIZE, 0))}
                >
                  Previous
                </button>
                <span>
                  Showing {offset + 1}-{offset + fullRanking.returned_candidates} of{' '}
                  {fullRanking.total_candidates}
                </span>
                <button
                  type="button"
                  disabled={
                    offset + fullRanking.returned_candidates >= fullRanking.total_candidates ||
                    fullStatus === 'loading'
                  }
                  onClick={() => loadFullPage(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default CandidateMatches
