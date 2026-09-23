import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefcaseIcon, EditDocumentIcon, SearchIcon } from '../icons'
import { analyzeJob, fetchJobs } from '../lib/jobsApi'
import { formatDate, formatExperience } from '../lib/jobFormat'

const TABS = [
  { id: 'enter', label: 'Enter job details', Icon: EditDocumentIcon },
  { id: 'select', label: 'Select existing job', Icon: BriefcaseIcon },
]

// The Job card owns the scoring action. Either tab ends in `onJobChosen(id)`;
// the dashboard loads the Job and hands it back as `job` (a JobDetail), and
// the primary button scores the selected batch against it.
function JobDescription({
  job,
  jobStatus = 'idle', // idle | loading | ready | error
  jobError = '',
  onJobChosen,
  onClearJob,
  selectedCount = 0,
  scoring = false,
  onScore,
}) {
  const [activeTab, setActiveTab] = useState('enter')
  const tabRefs = useRef({})

  // "Enter job details" tab state
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [message, setMessage] = useState('')

  // "Select existing job" tab state
  const [jobsStatus, setJobsStatus] = useState('idle') // idle | loading | success | error
  const [jobsError, setJobsError] = useState('')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [jobSearch, setJobSearch] = useState('')

  const visibleJobs = useMemo(() => {
    const term = jobSearch.trim().toLowerCase()
    if (!term) return jobs
    return jobs.filter((entry) => {
      const haystack = [entry.title, entry.company_name].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [jobs, jobSearch])

  const loadJobs = () => {
    setJobsStatus('loading')
    setJobsError('')
    fetchJobs()
      .then((data) => {
        setJobs(data.jobs)
        setJobsStatus('success')
      })
      .catch((err) => {
        setJobsError(err.message)
        setJobsStatus('error')
      })
  }

  const activateTab = (id) => {
    setActiveTab(id)
    if (id === 'select' && jobsStatus === 'idle') {
      loadJobs()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const description = text.trim()
    if (!description) return

    setStatus('loading')
    setMessage('')

    try {
      const data = await analyzeJob(description)
      setStatus('idle')
      setText('')
      onJobChosen?.(data.job_id)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const handleUseSelectedJob = () => {
    const chosen = jobs.find((entry) => entry.job_id === selectedJobId)
    if (!chosen || !chosen.ready_to_match) return
    onJobChosen?.(chosen.job_id)
  }

  const handleTabKeyDown = (e) => {
    const currentIndex = TABS.findIndex((t) => t.id === activeTab)
    let nextIndex = null

    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = TABS.length - 1

    if (nextIndex !== null) {
      e.preventDefault()
      const nextTab = TABS[nextIndex].id
      activateTab(nextTab)
      tabRefs.current[nextTab]?.focus()
    }
  }

  // The button is disabled with a reason rather than hidden, so the user
  // always sees what is missing before they can score.
  let scoreReason = ''
  if (job && !job.ready_to_match) {
    scoreReason = 'This job has no usable skill, experience or education requirement, so nothing can be scored.'
  } else if (selectedCount === 0) {
    scoreReason = 'Select at least one ready CV in Recent Uploads.'
  }
  const canScore = Boolean(job) && !scoreReason && !scoring

  return (
    <section className="card job-description-card">
      <h2 className="card-title">Job Description</h2>

      {jobStatus === 'loading' && (
        <p className="empty-hint" aria-live="polite">
          Loading job…
        </p>
      )}

      {jobStatus === 'error' && (
        <div className="job-summary">
          <p className="upload-message error" role="alert">
            {jobError}
          </p>
          <button type="button" className="link-button" onClick={onClearJob}>
            Choose a different job
          </button>
        </div>
      )}

      {jobStatus === 'ready' && job ? (
        <div className="job-summary">
          <div className="job-summary-header">
            <div>
              <p className="job-title">{job.title}</p>
              {job.company_name && <p className="job-meta">{job.company_name}</p>}
            </div>
            <span className={`pill ${job.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
              {job.ready_to_match ? 'Ready to match' : 'Missing requirements'}
            </span>
          </div>

          {job.required_skills.length > 0 && (
            <>
              <p className="job-section-label">Required Skills</p>
              <div className="chip-row">
                {job.required_skills.map((name) => (
                  <span className="chip" key={name}>
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}

          {job.preferred_skills.length > 0 && (
            <>
              <p className="job-section-label">Preferred Skills (not scored)</p>
              <div className="chip-row">
                {job.preferred_skills.map((name) => (
                  <span className="chip chip-muted" key={name}>
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}

          <p className="job-meta">Experience: {formatExperience(job.required_experience_years)}</p>
          {job.required_education && <p className="job-meta">Education: {job.required_education}</p>}
          <p className="job-meta">
            {job.applications_count} application{job.applications_count === 1 ? '' : 's'} so far
          </p>

          <button
            type="button"
            className="use-selected-job-button score-button"
            disabled={!canScore}
            title={scoreReason || undefined}
            onClick={onScore}
          >
            {scoring
              ? 'Scoring…'
              : `Score ${selectedCount} CV${selectedCount === 1 ? '' : 's'} against ${job.title}`}
          </button>
          {scoreReason && !scoring && <p className="score-reason">{scoreReason}</p>}

          <div className="job-summary-actions">
            <Link to={`/jobs/${job.job_id}`} className="link-button">
              View job
            </Link>
            <Link to={`/jobs/${job.job_id}/matches`} className="link-button">
              All applications for this job
            </Link>
            <button type="button" className="link-button" onClick={onClearJob}>
              Choose a different job
            </button>
          </div>
        </div>
      ) : (
        jobStatus === 'idle' && (
          <>
            <div className="job-tablist" role="tablist" aria-label="Job description input method">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  ref={(el) => {
                    tabRefs.current[id] = el
                  }}
                  type="button"
                  role="tab"
                  id={`job-tab-${id}`}
                  aria-selected={activeTab === id}
                  aria-controls={`job-tabpanel-${id}`}
                  tabIndex={activeTab === id ? 0 : -1}
                  className={`job-tab${activeTab === id ? ' active' : ''}`}
                  onClick={() => activateTab(id)}
                  onKeyDown={handleTabKeyDown}
                >
                  <Icon width={16} height={16} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div
              role="tabpanel"
              id="job-tabpanel-enter"
              aria-labelledby="job-tab-enter"
              className="job-tab-panel"
              hidden={activeTab !== 'enter'}
            >
              <form onSubmit={handleSubmit} className="job-form">
                <p className="card-subtitle">Paste a job description</p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the full job posting text here…"
                  rows={7}
                />
                <button type="submit" disabled={!text.trim() || status === 'loading'}>
                  {status === 'loading' ? 'Analyzing…' : 'Analyze Job'}
                </button>
                {status === 'error' && <p className="upload-message error">{message}</p>}
              </form>
            </div>

            <div
              role="tabpanel"
              id="job-tabpanel-select"
              aria-labelledby="job-tab-select"
              className="job-tab-panel"
              hidden={activeTab !== 'select'}
            >
              {jobsStatus === 'loading' && <p className="empty-hint">Loading jobs…</p>}

              {jobsStatus === 'error' && (
                <div>
                  <p className="upload-message error">{jobsError}</p>
                  <button type="button" className="link-button" onClick={loadJobs}>
                    Retry
                  </button>
                </div>
              )}

              {jobsStatus === 'success' && jobs.length === 0 && (
                <p className="empty-hint">No existing jobs found.</p>
              )}

              {jobsStatus === 'success' && jobs.length > 0 && (
                <>
                  <div className="search-field existing-jobs-search">
                    <SearchIcon width={16} height={16} aria-hidden="true" className="search-field-icon" />
                    <label htmlFor="existing-job-search" className="visually-hidden">
                      Search existing jobs by title or company
                    </label>
                    <input
                      id="existing-job-search"
                      type="search"
                      placeholder="Search by title or company…"
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                    />
                  </div>

                  {visibleJobs.length === 0 && (
                    <p className="empty-hint">No jobs match your search.</p>
                  )}

                  <ul className="existing-jobs-list">
                    {visibleJobs.map((entry) => (
                      <li key={entry.job_id}>
                        <label
                          className={`existing-job-card${
                            selectedJobId === entry.job_id ? ' selected' : ''
                          }${!entry.ready_to_match ? ' disabled' : ''}`}
                        >
                          <input
                            type="radio"
                            name="existing-job"
                            value={entry.job_id}
                            checked={selectedJobId === entry.job_id}
                            disabled={!entry.ready_to_match}
                            onChange={() => setSelectedJobId(entry.job_id)}
                          />
                          <div className="existing-job-info">
                            <div className="existing-job-header">
                              <p className="existing-job-title">{entry.title}</p>
                              <span className={`pill ${entry.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
                                {entry.ready_to_match ? 'Ready to match' : 'Missing requirements'}
                              </span>
                            </div>
                            <div className="existing-job-meta-row">
                              {entry.company_name && <span>{entry.company_name}</span>}
                              <span>
                                {entry.required_experience_years != null
                                  ? `${entry.required_experience_years}+ years experience`
                                  : 'Experience not specified'}
                              </span>
                              {entry.required_education && <span>Education: {entry.required_education}</span>}
                              <span>
                                {entry.required_skills_count} required skill
                                {entry.required_skills_count === 1 ? '' : 's'}
                              </span>
                              <span>
                                {entry.applications_count} application
                                {entry.applications_count === 1 ? '' : 's'}
                              </span>
                              {entry.posting_date && <span>Posted {formatDate(entry.posting_date)}</span>}
                            </div>
                            {!entry.ready_to_match && (
                              <p className="existing-job-warning">
                                This job has no usable skill, experience, or education requirements
                                yet, so candidates can't be matched against it.
                              </p>
                            )}
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className="use-selected-job-button"
                    disabled={!selectedJobId}
                    onClick={handleUseSelectedJob}
                  >
                    Use selected job
                  </button>
                </>
              )}
            </div>
          </>
        )
      )}
    </section>
  )
}

export default JobDescription
