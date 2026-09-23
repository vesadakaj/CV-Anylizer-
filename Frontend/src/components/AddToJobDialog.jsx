import { useEffect, useMemo, useState } from 'react'
import { SearchIcon } from '../icons'
import { addCandidateToJob, fetchCandidate } from '../lib/candidatesApi'
import { fetchJobs } from '../lib/jobsApi'
import { formatDateTime } from '../lib/userFormat'
import Modal from './Modal'

// "Add to job" for one Candidate: pick a Job (search), pick which CV when
// they have more than one (newest preselected), post. Shared by the matches
// page, the Candidates list and the Candidate detail page.
//
// `candidate` needs `id` and `full_name`; when `cvs` and `applications` are
// not given they are loaded from the Candidate detail endpoint.
function AddToJobDialog({ candidate, cvs: givenCvs, applications: givenApplications, excludeJobId = null, onClose, onDone }) {
  const [jobs, setJobs] = useState([])
  const [cvs, setCvs] = useState(givenCvs || null)
  const [applications, setApplications] = useState(givenApplications || null)
  const [loadStatus, setLoadStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [jobId, setJobId] = useState(null)
  const [cvId, setCvId] = useState(givenCvs?.[0]?.cv_id ?? null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadStatus('loading')
    setLoadError('')
    const needCandidate = givenCvs == null || givenApplications == null
    Promise.all([fetchJobs(), needCandidate ? fetchCandidate(candidate.id) : null])
      .then(([jobsData, detail]) => {
        if (cancelled) return
        setJobs(jobsData.jobs)
        if (detail) {
          setCvs(detail.cvs)
          setApplications(detail.applications)
          setCvId((current) => current ?? detail.cvs[0]?.cv_id ?? null)
        }
        setLoadStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err.message)
        setLoadStatus('error')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id])

  const appliedJobIds = useMemo(
    () => new Set((applications || []).map((application) => application.job_id)),
    [applications],
  )

  const visibleJobs = useMemo(() => {
    const term = search.trim().toLowerCase()
    return jobs.filter((job) => {
      if (excludeJobId != null && job.job_id === excludeJobId) return false
      if (!term) return true
      return [job.title, job.company_name].filter(Boolean).join(' ').toLowerCase().includes(term)
    })
  }, [jobs, search, excludeJobId])

  const chosenJob = jobs.find((job) => job.job_id === jobId) || null
  const hasCvs = (cvs?.length || 0) > 0
  const canSubmit = Boolean(chosenJob?.ready_to_match) && hasCvs && !pending

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setPending(true)
    setError('')
    try {
      const result = await addCandidateToJob(candidate.id, { jobId, cvId })
      onDone?.(result, chosenJob)
    } catch (err) {
      setError(err.message || 'Could not add the candidate to the job.')
      setPending(false)
    }
  }

  return (
    <Modal title={`Add ${candidate.full_name} to a job`} onClose={onClose} wide>
      {loadStatus === 'loading' && (
        <p className="empty-hint" aria-live="polite">
          Loading jobs…
        </p>
      )}

      {loadStatus === 'error' && (
        <p className="upload-message error" role="alert">
          {loadError}
        </p>
      )}

      {loadStatus === 'ready' && !hasCvs && (
        <p className="empty-hint">This candidate has no CV, so there is nothing to score.</p>
      )}

      {loadStatus === 'ready' && hasCvs && (
        <form className="job-form" onSubmit={handleSubmit} noValidate>
          <div className="search-field existing-jobs-search">
            <SearchIcon width={16} height={16} aria-hidden="true" className="search-field-icon" />
            <label htmlFor="add-to-job-search" className="visually-hidden">
              Search jobs by title or company
            </label>
            <input
              id="add-to-job-search"
              type="search"
              placeholder="Search jobs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {visibleJobs.length === 0 && <p className="empty-hint">No jobs match your search.</p>}

          <ul className="existing-jobs-list dialog-jobs-list">
            {visibleJobs.map((job) => {
              const alreadyApplied = appliedJobIds.has(job.job_id)
              return (
                <li key={job.job_id}>
                  <label
                    className={`existing-job-card${jobId === job.job_id ? ' selected' : ''}${
                      !job.ready_to_match ? ' disabled' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="add-to-job"
                      value={job.job_id}
                      checked={jobId === job.job_id}
                      disabled={!job.ready_to_match || pending}
                      onChange={() => setJobId(job.job_id)}
                    />
                    <div className="existing-job-info">
                      <div className="existing-job-header">
                        <p className="existing-job-title">{job.title}</p>
                        {alreadyApplied ? (
                          <span className="pill pill-neutral">Already applied</span>
                        ) : (
                          <span className={`pill ${job.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
                            {job.ready_to_match ? 'Ready to match' : 'Missing requirements'}
                          </span>
                        )}
                      </div>
                      <div className="existing-job-meta-row">
                        {job.company_name && <span>{job.company_name}</span>}
                        <span>
                          {job.applications_count} application{job.applications_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      {alreadyApplied && (
                        <p className="existing-job-warning">
                          Adding again replaces the CV this application is scored from.
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>

          {cvs.length > 1 && (
            <fieldset className="cv-picker">
              <legend className="job-section-label">Score from which CV?</legend>
              {cvs.map((cv, index) => (
                <label key={cv.cv_id} className="filter-radio">
                  <input
                    type="radio"
                    name="add-to-job-cv"
                    value={cv.cv_id}
                    checked={cvId === cv.cv_id}
                    disabled={pending}
                    onChange={() => setCvId(cv.cv_id)}
                  />
                  <span>
                    {cv.file_name}
                    <span className="cv-picker-meta">
                      {' '}
                      · {formatDateTime(cv.uploaded_at)}
                      {index === 0 ? ' · newest' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="use-selected-job-button" disabled={!canSubmit}>
              {pending ? 'Adding…' : chosenJob ? `Add to ${chosenJob.title}` : 'Add to job'}
            </button>
            <button type="button" className="table-action-button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default AddToJobDialog
