import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AddToJobDialog from '../components/AddToJobDialog'
import { PinIcon, PlusIcon } from '../icons'
import { addToJobMessage } from '../lib/applicationFormat'
import { fetchCandidate } from '../lib/candidatesApi'
import { initials, scoreTierClass } from '../lib/scoreTier'
import { formatDateTime } from '../lib/userFormat'

function CandidateDetailPage() {
  const { candidateId: idParam } = useParams()
  const candidateId = Number(idParam)
  const isValidId = Number.isInteger(candidateId) && candidateId > 0

  const [status, setStatus] = useState('idle') // idle | loading | success | error | not_found
  const [errorMessage, setErrorMessage] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toast, setToast] = useState('')
  // Two of this person's CVs, to see what a newer document actually changed.
  const [selectedCvs, setSelectedCvs] = useState([])

  const load = () => {
    if (!isValidId) {
      setStatus('not_found')
      return
    }
    setStatus('loading')
    setErrorMessage('')
    fetchCandidate(candidateId)
      .then((data) => {
        setCandidate(data)
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
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId])

  const isUnattached = candidate && candidate.applications.length === 0

  const toggleCv = (cvId) => {
    setSelectedCvs((current) => {
      if (current.includes(cvId)) return current.filter((id) => id !== cvId)
      if (current.length === 2) return current
      return [...current, cvId]
    })
  }

  const canCompareCvs = selectedCvs.length === 2
  // No job in the link: two CVs of one person are compared as profiles, and
  // the comparison page offers a job to score them against.
  const compareCvsPath = canCompareCvs
    ? `/compare?cv_a=${selectedCvs[0]}&cv_b=${selectedCvs[1]}`
    : ''

  return (
    <main className="page-container">
      <Link to="/candidates" className="link-button back-link">
        ← Back to candidates
      </Link>

      {toast && (
        <div className="page-banner success" role="status">
          <span>{toast}</span>
          <button type="button" className="page-banner-dismiss" aria-label="Dismiss message" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="card">
          <p className="empty-hint" aria-live="polite">
            Loading candidate…
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="card">
          <p className="upload-message error" role="alert">
            {errorMessage}
          </p>
          <button type="button" className="use-selected-job-button" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {status === 'not_found' && (
        <div className="card">
          <h1 className="page-title">Candidate not found</h1>
          <p className="empty-hint">This candidate doesn't exist or may have been removed.</p>
          <Link to="/candidates" className="use-selected-job-button">
            Back to candidates
          </Link>
        </div>
      )}

      {status === 'success' && candidate && (
        <>
          <section className="card job-detail-card" aria-labelledby="candidate-heading">
            <div className="page-header">
              <div className="candidate-identity">
                <span className="candidate-avatar">{initials(candidate.full_name)}</span>
                <div>
                  <h1 id="candidate-heading" className="page-title">
                    {candidate.full_name}
                  </h1>
                  <div className="candidate-contact-row">
                    {candidate.email ? <span>{candidate.email}</span> : <span>No email</span>}
                    {candidate.phone && <span>{candidate.phone}</span>}
                    {candidate.location && (
                      <span>
                        <PinIcon width={13} height={13} /> {candidate.location}
                      </span>
                    )}
                  </div>
                  <div className="chip-row candidate-flags">
                    {!candidate.linkable && (
                      <span
                        className="pill pill-warning"
                        title="No email address was found, so this candidate can never be merged with another CV."
                      >
                        Unlinkable
                      </span>
                    )}
                    {isUnattached && <span className="pill pill-neutral">Unattached</span>}
                  </div>
                </div>
              </div>
              <div className="page-header-controls">
                <button
                  type="button"
                  className="create-job-button"
                  onClick={() => setDialogOpen(true)}
                  disabled={candidate.cvs.length === 0}
                  title={candidate.cvs.length === 0 ? 'This candidate has no CV to score.' : undefined}
                >
                  <PlusIcon width={16} height={16} aria-hidden="true" />
                  <span>Add to job</span>
                </button>
              </div>
            </div>
          </section>

          <section className="card job-detail-card" aria-labelledby="candidate-cvs-heading">
            <h2 id="candidate-cvs-heading" className="card-title">
              CVs
            </h2>
            <p className="card-subtitle">
              The newest CV supplies the contact details above. Each application is scored from one specific CV.
            </p>
            {candidate.cvs.length === 0 ? (
              <p className="empty-hint">No CVs.</p>
            ) : (
              <>
                {candidate.cvs.length > 1 && (
                  <div className="compare-bar">
                    <p className="compare-bar-hint" aria-live="polite">
                      {canCompareCvs
                        ? 'Two CVs selected.'
                        : 'Tick two CVs to see what changed between them.'}
                    </p>
                    <div className="compare-bar-actions">
                      {selectedCvs.length > 0 && (
                        <button type="button" className="table-action-button" onClick={() => setSelectedCvs([])}>
                          Clear
                        </button>
                      )}
                      {canCompareCvs ? (
                        <Link to={compareCvsPath} className="use-selected-job-button compare-bar-button">
                          Compare these two CVs
                        </Link>
                      ) : (
                        <button type="button" className="use-selected-job-button compare-bar-button" disabled>
                          Compare these two CVs
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="table-scroll">
                  <table className="jobs-table detail-table">
                    <thead>
                      <tr>
                        {candidate.cvs.length > 1 && <th scope="col" className="compare-select-column">Compare</th>}
                        <th scope="col">File</th>
                        <th scope="col">Uploaded</th>
                        <th scope="col">Uploaded by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidate.cvs.map((cv, index) => (
                        <tr key={cv.cv_id}>
                          {candidate.cvs.length > 1 && (
                            <td className="compare-select-column">
                              <input
                                type="checkbox"
                                checked={selectedCvs.includes(cv.cv_id)}
                                disabled={!selectedCvs.includes(cv.cv_id) && canCompareCvs}
                                aria-label={`Select ${cv.file_name} to compare`}
                                onChange={() => toggleCv(cv.cv_id)}
                              />
                            </td>
                          )}
                          <td className="jobs-table-title">
                            {cv.file_name}
                            {index === 0 && <span className="users-you"> (newest)</span>}
                          </td>
                          <td>{formatDateTime(cv.uploaded_at)}</td>
                          <td>{cv.uploaded_by || 'Unknown'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="card job-detail-card" aria-labelledby="candidate-applications-heading">
            <h2 id="candidate-applications-heading" className="card-title">
              Applications
            </h2>
            {candidate.applications.length === 0 ? (
              <p className="empty-hint">
                Not attached to any job yet. Use "Add to job" above, or score this CV from the dashboard.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="jobs-table detail-table">
                  <thead>
                    <tr>
                      <th scope="col">Job</th>
                      <th scope="col">Score</th>
                      <th scope="col">Scored from</th>
                      <th scope="col">Added</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidate.applications.map((application) => {
                      const cv = candidate.cvs.find((entry) => entry.cv_id === application.cv_id)
                      const scored = application.status === 'scored' && application.overall_score != null
                      return (
                        <tr key={application.application_id}>
                          <td className="jobs-table-title">
                            <Link to={`/jobs/${application.job_id}`} className="table-link">
                              {application.job_title}
                            </Link>
                          </td>
                          <td>
                            {scored ? (
                              <span className={`simple-match-score inline-score ${scoreTierClass(application.overall_score)}`}>
                                {Math.round(application.overall_score)}%
                              </span>
                            ) : (
                              <span className="table-muted">Unscorable</span>
                            )}
                          </td>
                          <td>{cv ? cv.file_name : `CV ${application.cv_id}`}</td>
                          <td>{formatDateTime(application.created_at)}</td>
                          <td>
                            <Link to={`/jobs/${application.job_id}/matches`} className="table-action-button table-action-link">
                              View ranking
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {dialogOpen && candidate && (
        <AddToJobDialog
          candidate={candidate}
          cvs={candidate.cvs}
          applications={candidate.applications}
          onClose={() => setDialogOpen(false)}
          onDone={(result, job) => {
            setDialogOpen(false)
            setToast(addToJobMessage(result, job))
            load()
          }}
        />
      )}
    </main>
  )
}

export default CandidateDetailPage
