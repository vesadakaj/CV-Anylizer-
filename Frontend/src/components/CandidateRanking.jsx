import { useState } from 'react'

// Strip any trailing slash(es) so `${API_BASE}/api/...` never produces a
// double slash when VITE_API_URL is configured with one (e.g. "host.com/").
// If VITE_API_URL is unset, API_BASE is '' and requests fall back to a
// same-origin relative path ("/api/...") instead of the literal string
// "undefined/api/...".
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const PAGE_SIZE = 10

function CandidateRanking() {
  const [jobIdInput, setJobIdInput] = useState('')
  const [jobId, setJobId] = useState(null)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('idle') // idle | loading | success | error | not-found
  const [message, setMessage] = useState('')
  const [ranking, setRanking] = useState(null)

  const loadRanking = async (id, requestedOffset) => {
    setStatus('loading')
    setMessage('')

    try {
      const url = `${API_BASE}/api/jobs/${id}/matches?limit=${PAGE_SIZE}&offset=${requestedOffset}`
      const response = await fetch(url)
      const data = await response.json()

      if (response.status === 404) {
        setStatus('not-found')
        setMessage(data.detail || 'Job not found.')
        setRanking(null)
        return
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Could not load candidate ranking.')
      }

      setRanking(data)
      setOffset(requestedOffset)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
      setRanking(null)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const id = jobIdInput.trim()
    if (!id) return

    setJobId(id)
    loadRanking(id, 0)
  }

  const goToPage = (newOffset) => {
    if (!jobId) return
    loadRanking(jobId, newOffset)
  }

  return (
    <section className="candidate-ranking">
      <h2>Rank candidates for a job</h2>
      <p>Enter a job ID to see every candidate scored and ranked against it.</p>

      <form onSubmit={handleSubmit}>
        <input
          type="number"
          min="1"
          placeholder="Job ID"
          value={jobIdInput}
          onChange={(e) => setJobIdInput(e.target.value)}
        />
        <button type="submit" disabled={!jobIdInput || status === 'loading'}>
          {status === 'loading' ? 'Loading…' : 'Show ranking'}
        </button>
      </form>

      {(status === 'error' || status === 'not-found') && (
        <p className="ranking-message error">{message}</p>
      )}

      {status === 'success' && ranking && (
        <div className="ranking-results">
          <h3>
            {ranking.job_title} — {ranking.total_candidates} candidate
            {ranking.total_candidates === 1 ? '' : 's'}
          </h3>

          {ranking.candidates.length === 0 ? (
            <p className="ranking-message">No candidates to rank yet.</p>
          ) : (
            <ul className="ranking-list">
              {ranking.candidates.map((candidate) => (
                <li key={candidate.candidate_id} className="ranking-item">
                  <div className="ranking-item-header">
                    <span className="rank-badge">#{candidate.rank}</span>
                    <span className="candidate-name">{candidate.candidate_name}</span>
                    {candidate.status === 'scored' ? (
                      <span className="overall-score">
                        {candidate.overall_score.toFixed(2)}% match
                      </span>
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

                  <div className="skill-lists">
                    <p>
                      <strong>Matched skills:</strong>{' '}
                      {candidate.matched_skills.length
                        ? candidate.matched_skills.join(', ')
                        : 'none'}
                    </p>
                    <p>
                      <strong>Missing required skills:</strong>{' '}
                      {candidate.missing_required_skills.length
                        ? candidate.missing_required_skills.join(', ')
                        : 'none'}
                    </p>
                    <p>
                      <strong>Experience:</strong> {candidate.candidate_experience_years} yrs
                      {candidate.required_experience_years != null
                        ? ` (required: ${candidate.required_experience_years} yrs)`
                        : ' (job has no experience requirement)'}
                    </p>
                    <p>
                      <strong>Education:</strong>{' '}
                      {candidate.candidate_education_level || 'unknown'}
                      {candidate.required_education_level
                        ? ` (required: ${candidate.required_education_level})`
                        : ' (job has no mappable education requirement)'}
                    </p>
                  </div>

                  <p className="explanation">{candidate.explanation}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="pagination">
            <button
              type="button"
              disabled={offset === 0 || status === 'loading'}
              onClick={() => goToPage(Math.max(offset - PAGE_SIZE, 0))}
            >
              Previous
            </button>
            <span>
              Showing {offset + 1}-{offset + ranking.returned_candidates} of{' '}
              {ranking.total_candidates}
            </span>
            <button
              type="button"
              disabled={offset + ranking.returned_candidates >= ranking.total_candidates || status === 'loading'}
              onClick={() => goToPage(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default CandidateRanking
