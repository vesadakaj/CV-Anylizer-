import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJobMatches, fetchJobs } from '../lib/jobsApi'
import { formatScore } from '../lib/comparisonFormat'
import { initials, scoreTierClass } from '../lib/scoreTier'

// Picking the pair. A job is asked for first because that is also the
// context the comparison is scored in: whoever is being compared is almost
// always being compared *for* something.
function ComparePicker({ initialJobId = '', onCompare }) {
  const [jobs, setJobs] = useState([])
  const [jobsError, setJobsError] = useState('')
  const [jobId, setJobId] = useState(initialJobId ? String(initialJobId) : '')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState([]) // cv ids, at most two

  const loadApplications = (id) => {
    setStatus('loading')
    setErrorMessage('')
    fetchJobMatches(Number(id), { limit: 100, offset: 0 })
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
    fetchJobs()
      .then((data) => setJobs(data.jobs))
      .catch((err) => setJobsError(err.message))
    if (initialJobId) loadApplications(initialJobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The list of candidates belongs to the chosen job, so a new job empties
  // both it and whatever was ticked in it.
  const selectJob = (value) => {
    setJobId(value)
    setSelected([])
    setRows([])
    if (!value) {
      setStatus('idle')
      return
    }
    loadApplications(value)
  }

  const toggle = (cvId) => {
    setSelected((current) => {
      if (current.includes(cvId)) return current.filter((id) => id !== cvId)
      if (current.length === 2) return current
      return [...current, cvId]
    })
  }

  const ready = selected.length === 2

  return (
    <section className="card compare-picker-card" aria-labelledby="compare-picker-heading">
      <h1 id="compare-picker-heading" className="page-title">
        Compare two CVs
      </h1>
      <p className="page-subtitle">
        Pick a job, then two of its candidates. You can also compare two CVs of the same person from
        their <Link to="/candidates">candidate page</Link>.
      </p>

      {jobsError && (
        <p className="upload-message error" role="alert">
          {jobsError}
        </p>
      )}

      <div className="form-field compare-picker-job">
        <label htmlFor="compare-picker-job-select">Job</label>
        <select
          id="compare-picker-job-select"
          value={jobId}
          onChange={(event) => selectJob(event.target.value)}
        >
          <option value="">Select a job…</option>
          {jobs.map((job) => (
            <option key={job.job_id} value={job.job_id}>
              {job.title}
              {job.company_name ? ` — ${job.company_name}` : ''} ({job.applications_count}{' '}
              application{job.applications_count === 1 ? '' : 's'})
            </option>
          ))}
        </select>
      </div>

      {status === 'loading' && (
        <p className="empty-hint" aria-live="polite">
          Loading applications…
        </p>
      )}

      {status === 'error' && (
        <p className="upload-message error" role="alert">
          {errorMessage}
        </p>
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
          <p className="compare-picker-hint" aria-live="polite">
            {ready
              ? 'Two selected. Compare them below.'
              : `Select ${2 - selected.length} more candidate${selected.length === 1 ? '' : 's'}.`}
          </p>
          <ul className="compare-picker-list">
            {rows.map((row) => {
              const checked = selected.includes(row.cv_id)
              return (
                <li key={row.application_id} className={`compare-picker-item${checked ? ' selected' : ''}`}>
                  <label className="compare-picker-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && ready}
                      onChange={() => toggle(row.cv_id)}
                    />
                    <span className="simple-match-avatar" aria-hidden="true">
                      {initials(row.candidate_name)}
                    </span>
                    <span className="compare-picker-name">{row.candidate_name}</span>
                  </label>
                  <span className={`simple-match-score inline-score ${scoreTierClass(row.overall_score)}`}>
                    {row.status === 'scored' ? formatScore(row.overall_score) : 'Unscorable'}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="form-actions">
            <button
              type="button"
              className="use-selected-job-button"
              disabled={!ready}
              onClick={() => onCompare({ cvA: selected[0], cvB: selected[1], jobId: Number(jobId) })}
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
