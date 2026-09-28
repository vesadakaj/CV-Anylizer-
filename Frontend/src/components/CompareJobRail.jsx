import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchIcon } from '../icons'

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// One Job, in the look of the dashboard's "Select existing job" cards so
// the two pickers read as one system.
function JobOption({ job, selected, blocker, onSelect }) {
  return (
    <label
      className={`existing-job-card compare-rail-card${selected ? ' selected' : ''}${blocker ? ' disabled' : ''}`}
    >
      <input
        type="radio"
        name="compare-job"
        checked={selected}
        disabled={Boolean(blocker)}
        onChange={() => onSelect(job.job_id)}
      />
      <div className="existing-job-info">
        <p className="existing-job-title">{job.title}</p>
        <div className="existing-job-meta-row">
          {job.company_name && <span>{job.company_name}</span>}
          <span className="compare-rail-count">{plural(job.applications_count, 'application')}</span>
        </div>
        {blocker && <p className="existing-job-warning">{blocker}</p>}
        {!blocker && !job.ready_to_match && (
          <p className="existing-job-warning">No scorable requirements — profiles only.</p>
        )}
      </div>
    </label>
  )
}

// The job context of the Compare page, always in view. Before a pair is
// chosen it says whose Applications to pick from, so a Job with fewer than
// two is offered but not selectable. After, it re-scores the pair: any Job
// works (neither CV has to have applied to it), and so does no Job at all.
function CompareJobRail({ jobs, status, error, onRetry, selectedJobId, onSelect, mode }) {
  const [term, setTerm] = useState('')
  const picking = mode === 'pick'

  const visibleJobs = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (!t) return jobs
    return jobs.filter((job) => [job.title, job.company_name].filter(Boolean).join(' ').toLowerCase().includes(t))
  }, [jobs, term])

  const blockerFor = (job) => {
    if (!picking || job.applications_count >= 2) return ''
    return job.applications_count === 0 ? 'No applications yet.' : 'Only one application.'
  }

  return (
    <aside className="card compare-rail" aria-labelledby="compare-rail-heading">
      <h2 id="compare-rail-heading" className="card-title">
        {picking ? 'Jobs' : 'Score against'}
      </h2>
      <p className="card-subtitle">
        {picking ? 'The two CVs come from the job you pick.' : 'Pick a job to re-score this pair.'}
      </p>

      {status === 'loading' && <p className="empty-hint">Loading jobs…</p>}

      {status === 'error' && (
        <div>
          <p className="upload-message error" role="alert">
            {error}
          </p>
          <button type="button" className="link-button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && jobs.length === 0 && picking && (
        <p className="empty-hint">
          No jobs yet. <Link to="/jobs/new">Create one</Link> and score some CVs against it first.
        </p>
      )}

      {status === 'success' && (jobs.length > 0 || !picking) && (
        <>
          {jobs.length > 0 && (
            <div className="search-field existing-jobs-search compare-rail-search">
              <SearchIcon width={16} height={16} aria-hidden="true" className="search-field-icon" />
              <input
                type="search"
                aria-label="Search jobs by title or company"
                placeholder="Search by title or company…"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
            </div>
          )}

          <ul className="existing-jobs-list compare-rail-list">
            {!picking && (
              <li>
                <label className={`existing-job-card compare-rail-card compare-rail-none${selectedJobId == null ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="compare-job"
                    checked={selectedJobId == null}
                    onChange={() => onSelect(null)}
                  />
                  <div className="existing-job-info">
                    <p className="existing-job-title">No job — profiles only</p>
                    <div className="existing-job-meta-row">
                      <span>Plain differences, nothing is scored</span>
                    </div>
                  </div>
                </label>
              </li>
            )}
            {visibleJobs.map((job) => (
              <li key={job.job_id}>
                <JobOption
                  job={job}
                  selected={job.job_id === selectedJobId}
                  blocker={blockerFor(job)}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>

          {term && visibleJobs.length === 0 && <p className="empty-hint">No jobs match your search.</p>}
        </>
      )}
    </aside>
  )
}

export default CompareJobRail
