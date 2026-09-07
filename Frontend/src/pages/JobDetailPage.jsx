import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchJob } from '../lib/jobsApi'
import { formatDate, formatExperience } from '../lib/jobFormat'

function JobDetailPage() {
  const { jobId: jobIdParam } = useParams()

  const jobId = Number(jobIdParam)
  const isValidId = Number.isInteger(jobId) && jobId > 0

  const [status, setStatus] = useState('idle') // idle | loading | success | error | not_found
  const [errorMessage, setErrorMessage] = useState('')
  const [job, setJob] = useState(null)

  const loadJob = () => {
    if (!isValidId) {
      setStatus('not_found')
      return
    }

    setStatus('loading')
    setErrorMessage('')
    fetchJob(jobId)
      .then((data) => {
        setJob(data)
        setStatus('success')
      })
      .catch((err) => {
        if (err.status === 404) {
          setStatus('not_found')
        } else {
          setErrorMessage(err.message)
          setStatus('error')
        }
      })
  }

  useEffect(() => {
    loadJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return (
    <main className="page-container">
      <Link to="/jobs" className="link-button back-link">
        ← Back to jobs
      </Link>

      {status === 'loading' && (
        <div className="card">
          <p className="empty-hint" aria-live="polite">
            Loading job…
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="card">
          <p className="upload-message error" role="alert">
            {errorMessage}
          </p>
          <button type="button" className="use-selected-job-button" onClick={loadJob}>
            Retry
          </button>
        </div>
      )}

      {status === 'not_found' && (
        <div className="card">
          <h1 className="page-title">Job not found</h1>
          <p className="empty-hint">
            This job doesn't exist or may have been removed.
          </p>
          <Link to="/jobs" className="use-selected-job-button">
            Back to jobs
          </Link>
        </div>
      )}

      {status === 'success' && job && (
        <>
          <section className="card job-detail-card" aria-labelledby="job-overview-heading">
            <div className="page-header">
              <div>
                <h1 id="job-overview-heading" className="page-title">
                  {job.title}
                </h1>
                {job.company_name && <p className="page-subtitle">{job.company_name}</p>}
              </div>
              <span className={`pill ${job.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
                {job.ready_to_match ? 'Ready to match' : 'Missing requirements'}
              </span>
            </div>

            <div className="job-detail-meta-grid">
              <div>
                <p className="job-section-label">Location</p>
                <p className="job-meta">{job.location || 'Not specified'}</p>
              </div>
              <div>
                <p className="job-section-label">Department</p>
                <p className="job-meta">{job.department || 'Not specified'}</p>
              </div>
              <div>
                <p className="job-section-label">Employment Type</p>
                <p className="job-meta">{job.employment_type || 'Not specified'}</p>
              </div>
              <div>
                <p className="job-section-label">Posting Date</p>
                <p className="job-meta">{formatDate(job.posting_date)}</p>
              </div>
            </div>
          </section>

          {job.description && (
            <section className="card job-detail-card" aria-labelledby="job-description-heading">
              <h2 id="job-description-heading" className="card-title">
                Original Description
              </h2>
              <p className="job-description-text-full">{job.description}</p>
            </section>
          )}

          <section className="card job-detail-card" aria-labelledby="job-responsibilities-heading">
            <h2 id="job-responsibilities-heading" className="card-title">
              What You'll Be Doing
            </h2>
            {job.responsibilities.length > 0 ? (
              <ul className="job-detail-list">
                {job.responsibilities.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">Not specified.</p>
            )}
          </section>

          <section className="card job-detail-card" aria-labelledby="job-required-heading">
            <h2 id="job-required-heading" className="card-title">
              Required Qualifications
            </h2>

            <div className="job-detail-meta-grid job-detail-meta-grid-narrow">
              <div>
                <p className="job-section-label">Required Experience</p>
                <p className="job-meta">{formatExperience(job.required_experience_years)}</p>
              </div>
              <div>
                <p className="job-section-label">Required Education</p>
                <p className="job-meta">{job.required_education || 'Not specified'}</p>
              </div>
            </div>

            <p className="job-section-label">Required Skills</p>
            {job.skills.some((s) => s.is_required) ? (
              <div className="chip-row">
                {job.skills
                  .filter((s) => s.is_required)
                  .map((skill) => (
                    <span className="chip" key={skill.name}>
                      {skill.name}
                    </span>
                  ))}
              </div>
            ) : (
              <p className="empty-hint">Not specified.</p>
            )}

            {job.required_qualifications.length > 0 && (
              <>
                <p className="job-section-label">Other Required Qualifications</p>
                <ul className="job-detail-list">
                  {job.required_qualifications.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            )}

            {!job.ready_to_match && (
              <p className="existing-job-warning">
                This job has no usable skill, experience, or education requirements yet, so
                candidates can't be meaningfully matched against it.
              </p>
            )}
          </section>

          <section className="card job-detail-card" aria-labelledby="job-preferred-heading">
            <h2 id="job-preferred-heading" className="card-title">
              In Addition, They May Have
            </h2>
            <p className="empty-hint">
              Preferred qualifications are informational only and never count toward the
              candidate match score.
            </p>
            {job.preferred_qualifications.length > 0 ? (
              <ul className="job-detail-list">
                {job.preferred_qualifications.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">Not specified.</p>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default JobDetailPage
