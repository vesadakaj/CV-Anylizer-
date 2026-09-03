import { useRef, useState } from 'react'
import { BriefcaseIcon, EditDocumentIcon } from '../icons'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

const TABS = [
  { id: 'enter', label: 'Enter job details', Icon: EditDocumentIcon },
  { id: 'select', label: 'Select existing job', Icon: BriefcaseIcon },
]

function JobDescription({ jobInfo, onAnalyzed }) {
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

  const fetchJobs = () => {
    setJobsStatus('loading')
    setJobsError('')
    fetch(`${API_BASE}/api/jobs`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Could not load existing jobs.')
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
      fetchJobs()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const description = text.trim()
    if (!description) return

    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch(`${API_BASE}/api/jobs/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Could not analyze job description.')
      }

      setStatus('idle')
      onAnalyzed?.(data.job_id, data.job_info)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const handleUseSelectedJob = () => {
    const job = jobs.find((j) => j.job_id === selectedJobId)
    if (!job || !job.ready_to_match) return

    onAnalyzed?.(job.job_id, {
      title: job.title,
      company_name: job.company_name,
      required_experience_years: job.required_experience_years,
      required_education: job.required_education,
      skills: job.skills,
    })
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

  return (
    <section className="card job-description-card">
      <h2 className="card-title">Job Description</h2>

      {jobInfo ? (
        <div className="job-summary">
          <p className="job-title">{jobInfo.title}</p>
          {jobInfo.company_name && <p className="job-meta">{jobInfo.company_name}</p>}

          {jobInfo.skills.length > 0 && (
            <>
              <p className="job-section-label">Required Skills:</p>
              <div className="chip-row">
                {jobInfo.skills.map((skill) => (
                  <span className="chip" key={skill.name}>
                    {skill.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {jobInfo.required_experience_years != null && (
            <p className="job-meta">Experience: {jobInfo.required_experience_years}+ years</p>
          )}
          {jobInfo.required_education && (
            <p className="job-meta">Education: {jobInfo.required_education}</p>
          )}

          <button type="button" className="link-button" onClick={() => onAnalyzed?.(null, null)}>
            Analyze a different job
          </button>
        </div>
      ) : (
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
                <button type="button" className="link-button" onClick={fetchJobs}>
                  Retry
                </button>
              </div>
            )}

            {jobsStatus === 'success' && jobs.length === 0 && (
              <p className="empty-hint">No existing jobs found.</p>
            )}

            {jobsStatus === 'success' && jobs.length > 0 && (
              <>
                <ul className="existing-jobs-list">
                  {jobs.map((job) => (
                    <li key={job.job_id}>
                      <label
                        className={`existing-job-card${
                          selectedJobId === job.job_id ? ' selected' : ''
                        }${!job.ready_to_match ? ' disabled' : ''}`}
                      >
                        <input
                          type="radio"
                          name="existing-job"
                          value={job.job_id}
                          checked={selectedJobId === job.job_id}
                          disabled={!job.ready_to_match}
                          onChange={() => setSelectedJobId(job.job_id)}
                        />
                        <div className="existing-job-info">
                          <div className="existing-job-header">
                            <p className="existing-job-title">{job.title}</p>
                            <span className={`pill ${job.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
                              {job.ready_to_match ? 'Ready to match' : 'Missing requirements'}
                            </span>
                          </div>
                          <div className="existing-job-meta-row">
                            {job.company_name && <span>{job.company_name}</span>}
                            <span>
                              {job.required_experience_years != null
                                ? `${job.required_experience_years}+ years experience`
                                : 'Experience not specified'}
                            </span>
                            {job.required_education && <span>Education: {job.required_education}</span>}
                            <span>
                              {job.required_skills_count} required skill
                              {job.required_skills_count === 1 ? '' : 's'}
                            </span>
                          </div>
                          {!job.ready_to_match && (
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
      )}
    </section>
  )
}

export default JobDescription
