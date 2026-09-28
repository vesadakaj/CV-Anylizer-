import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJobMatches } from '../lib/jobsApi'
import { formatScore } from '../lib/comparisonFormat'
import { initials, scoreTierClass } from '../lib/scoreTier'

// Picking the pair from one Job's Applications. The Job is chosen in the
// rail beside this panel, because it is also the context the comparison is
// scored in: whoever is being compared is almost always compared *for*
// something. The page keys this by job, so a new job starts a clean pick.
function ComparePicker({ jobId, job, onCompare }) {
  const [status, setStatus] = useState(jobId ? 'loading' : 'idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState([]) // cv ids in pick order: side A, then side B

  const loadApplications = () => {
    setStatus('loading')
    setErrorMessage('')
    fetchJobMatches(jobId, { limit: 100, offset: 0 })
      .then((data) => {
        setRows(data.applications)
        setStatus('success')
      })
      .catch((err) => {
        setErrorMessage(err.message)
        setStatus('error')
      })
  }

  useEffect(() => {
    if (jobId) loadApplications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ready = selected.length === 2

  // A third pick is refused rather than silently replacing one of the two.
  const toggle = (cvId) => {
    setSelected((current) => {
      if (current.includes(cvId)) return current.filter((id) => id !== cvId)
      if (current.length === 2) return current
      return [...current, cvId]
    })
  }

  if (!jobId) {
    return (
      <section className="card compare-picker-empty" aria-labelledby="compare-picker-heading">
        <h1 id="compare-picker-heading" className="page-title">
          Compare two CVs
        </h1>
        <p className="page-subtitle">
          Pick a job from the list to see who applied, then choose two of them. You can also compare two
          CVs of the same person from their <Link to="/candidates">candidate page</Link>.
        </p>
      </section>
    )
  }

  const nameOf = (cvId) => rows.find((row) => row.cv_id === cvId)?.candidate_name

  return (
    <section className="card" aria-labelledby="compare-picker-heading">
      <h1 id="compare-picker-heading" className="page-title">
        Compare two CVs
      </h1>
      <p className="page-subtitle">
        {job ? `${job.title}${job.company_name ? ` — ${job.company_name}` : ''}` : `Job ${jobId}`}. Pick two
        of its candidates; the first is side A.
      </p>

      {status === 'loading' && (
        <p className="empty-hint" aria-live="polite">
          Loading applications…
        </p>
      )}

      {status === 'error' && (
        <div>
          <p className="upload-message error" role="alert">
            {errorMessage}
          </p>
          <button type="button" className="link-button" onClick={loadApplications}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && rows.length === 0 && (
        <p className="empty-hint">
          No one has applied to this job yet, so there is nothing to compare. Upload CVs on the{' '}
          <Link to={`/jobs/${jobId}`}>job page</Link> first.
        </p>
      )}

      {status === 'success' && rows.length === 1 && (
        <p className="empty-hint">This job has only one application — a comparison needs two.</p>
      )}

      {status === 'success' && rows.length > 1 && (
        <>
          <ul className="compare-candidate-grid">
            {rows.map((row) => {
              const index = selected.indexOf(row.cv_id)
              const side = index === 0 ? 'a' : index === 1 ? 'b' : null
              return (
                <li key={row.application_id}>
                  <button
                    type="button"
                    className={`compare-candidate-card${side ? ` picked side-${side}` : ''}`}
                    aria-pressed={Boolean(side)}
                    disabled={!side && ready}
                    onClick={() => toggle(row.cv_id)}
                  >
                    <span className="compare-candidate-rank">#{row.rank}</span>
                    <span className="simple-match-avatar" aria-hidden="true">
                      {initials(row.candidate_name)}
                    </span>
                    <span className="compare-candidate-name">{row.candidate_name}</span>
                    <span className={`simple-match-score inline-score ${scoreTierClass(row.overall_score)}`}>
                      {row.status === 'scored' ? formatScore(row.overall_score) : 'Unscorable'}
                    </span>
                    {side && (
                      <span className={`compare-side-badge side-${side}`} aria-label={`side ${side.toUpperCase()}`}>
                        {side.toUpperCase()}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="compare-bar">
            <p className="compare-bar-hint" aria-live="polite">
              {ready
                ? `${nameOf(selected[0])} vs ${nameOf(selected[1])}`
                : `Select ${2 - selected.length} more candidate${selected.length === 1 ? '' : 's'}.`}
            </p>
            <button
              type="button"
              className="use-selected-job-button compare-bar-button"
              disabled={!ready}
              onClick={() => onCompare({ cvA: selected[0], cvB: selected[1], jobId })}
            >
              Compare selected
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default ComparePicker
