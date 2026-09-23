import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RecentUploads from '../components/RecentUploads'
import UploadResume from '../components/UploadResume'
import { fetchJob } from '../lib/jobsApi'
import { formatDate, formatExperience } from '../lib/jobFormat'
import { useCvUploadQueue } from '../lib/useCvUploadQueue'

function JobDetailPage() {
  const { jobId: jobIdParam } = useParams()

  const jobId = Number(jobIdParam)
  const isValidId = Number.isInteger(jobId) && jobId > 0

  const [status, setStatus] = useState('idle') // idle | loading | success | error | not_found
  const [errorMessage, setErrorMessage] = useState('')
  const [job, setJob] = useState(null)

  // Uploads here are attached to this Job in the same request, so a CV
  // uploaded on this page is never Unattached.
  const { items, isProcessing, addFiles, retry } = useCvUploadQueue({
    jobId: isValidId ? jobId : null,
  })
  const newApplications = items.filter((item) => item.application?.status === 'created').length
  const applicationsCount = (job?.applications_count ?? 0) + newApplications

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
                <p className="job-meta job-created-by">
                  Created by {job.created_by || 'unknown'}
                  {job.created_at ? ` · ${formatDate(job.created_at)}` : ''}
                </p>
              </div>
              <div className="job-detail-header-side">
                <span className={`pill ${job.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
                  {job.ready_to_match ? 'Ready to match' : 'Missing requirements'}
                </span>
                <p className="job-applications-count">
                  <strong>{applicationsCount}</strong> application{applicationsCount === 1 ? '' : 's'}
                </p>
                <Link to={`/jobs/${job.job_id}/matches`} className="link-button">
                  View all applications
                </Link>
              </div>
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

          <div className="job-upload-grid">
            <UploadResume
              isProcessing={isProcessing}
              onFilesSelected={addFiles}
              title="Upload CVs for this job"
              subtitle={
                job.ready_to_match
                  ? 'Each CV is extracted, attached to this job and scored in one step.'
                  : 'CVs are attached to this job but cannot be scored until it has a usable requirement.'
              }
              className="job-upload-card"
            />
            <RecentUploads
              title="Uploads for this job"
              rows={[...items].reverse()}
              isProcessing={isProcessing}
              onRetry={retry}
              emptyHint="CVs uploaded here show up with their score."
            />
          </div>

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
            {job.required_skills.length > 0 ? (
              <div className="chip-row">
                {job.required_skills.map((name) => (
                  <span className="chip" key={name}>
                    {name}
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
              Preferred skills and qualifications are informational only and never count toward the
              candidate match score.
            </p>

            <p className="job-section-label">Preferred Skills</p>
            {job.preferred_skills.length > 0 ? (
              <div className="chip-row">
                {job.preferred_skills.map((name) => (
                  <span className="chip chip-muted" key={name}>
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="empty-hint">None.</p>
            )}

            <p className="job-section-label">Preferred Qualifications</p>
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
