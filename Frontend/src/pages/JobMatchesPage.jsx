import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AddToJobDialog from '../components/AddToJobDialog'
import { addToJobMessage } from '../lib/applicationFormat'
import { fetchJobMatches } from '../lib/jobsApi'
import { clampPercent, initials, scoreTierClass } from '../lib/scoreTier'

const PAGE_SIZE = 10

function SkeletonRow({ index }) {
  return (
    <div className="simple-match-item skeleton-row" aria-hidden="true">
      <span className="skeleton-bar skeleton-rank" />
      <span className="skeleton-bar skeleton-avatar" />
      <span className="skeleton-bar skeleton-name" style={{ width: `${55 + ((index * 7) % 25)}%` }} />
      <span className="skeleton-bar skeleton-progress" />
      <span className="skeleton-bar skeleton-score" />
    </div>
  )
}

// One Application of the Job. Summary only: rank, name, bar, score. The
// breakdown is deliberately not rendered here - it belongs to the
// Application's own match, or to a head-to-head Comparison.
function ApplicationRow({ application, onAddToJob, selected, selectionFull, onToggleSelect }) {
  const tier = scoreTierClass(application.overall_score)
  const displayScore = Math.round(application.overall_score ?? 0)
  const barWidth = clampPercent(application.overall_score)
  const rankClass = application.rank === 1 ? ' first' : application.rank <= 3 ? ' top' : ''

  return (
    <li className="simple-match-item with-action selectable">
      <span className="simple-match-pick">
        <input
          type="checkbox"
          checked={selected}
          disabled={!selected && selectionFull}
          aria-label={`Select ${application.candidate_name} to compare`}
          onChange={() => onToggleSelect(application)}
        />
      </span>
      <span className={`simple-match-rank${rankClass}`}>{application.rank}</span>
      <span className="simple-match-avatar" aria-hidden="true">
        {initials(application.candidate_name)}
      </span>
      <Link to={`/candidates/${application.candidate_id}`} className="simple-match-name simple-match-link">
        {application.candidate_name}
      </Link>
      <div
        className="match-bar-track simple-match-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(barWidth)}
        aria-label={`${application.candidate_name}: ${displayScore}% match`}
      >
        <div className={`match-bar-fill ${tier}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className={`simple-match-score ${tier}`} aria-hidden="true">
        {displayScore}% match
      </span>
      <span className="simple-match-action">
        <button type="button" className="table-action-button" onClick={() => onAddToJob(application)}>
          Add to another job
        </button>
      </span>
    </li>
  )
}

function JobMatchesPage() {
  const { jobId: jobIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const isValidId = Number.isInteger(jobId) && jobId > 0

  const [status, setStatus] = useState('idle') // idle | loading | success | error | not_found
  const [errorMessage, setErrorMessage] = useState('')
  const [ranking, setRanking] = useState(null)
  const [offset, setOffset] = useState(0)
  const [pageStatus, setPageStatus] = useState('idle') // idle | loading | error
  const [pageErrorMessage, setPageErrorMessage] = useState('')
  const [dialogCandidate, setDialogCandidate] = useState(null) // { id, full_name }
  const [toast, setToast] = useState('')
  // The two Applications picked for a head-to-head Comparison. The CV id is
  // what the comparison reads, since that is the document each score came
  // from (ADR 0001).
  const [selected, setSelected] = useState([]) // [{ cv_id, candidate_name }]

  const loadPage = (requestedOffset, { initial = false } = {}) => {
    if (!isValidId) {
      setStatus('not_found')
      return
    }

    if (initial) {
      setStatus('loading')
      setErrorMessage('')
    } else {
      setPageStatus('loading')
      setPageErrorMessage('')
    }

    fetchJobMatches(jobId, { limit: PAGE_SIZE, offset: requestedOffset })
      .then((data) => {
        setRanking(data)
        setOffset(requestedOffset)
        setStatus('success')
        setPageStatus('idle')
      })
      .catch((err) => {
        if (err.status === 404) {
          setStatus('not_found')
          return
        }
        if (initial) {
          setErrorMessage(err.message)
          setStatus('error')
        } else {
          setPageErrorMessage(err.message)
          setPageStatus('error')
        }
      })
  }

  useEffect(() => {
    loadPage(0, { initial: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const toggleSelect = (application) => {
    setSelected((current) => {
      if (current.some((entry) => entry.cv_id === application.cv_id)) {
        return current.filter((entry) => entry.cv_id !== application.cv_id)
      }
      if (current.length === 2) return current
      return [...current, { cv_id: application.cv_id, candidate_name: application.candidate_name }]
    })
  }

  const compareReady = selected.length === 2
  const comparePath = compareReady
    ? `/compare?cv_a=${selected[0].cv_id}&cv_b=${selected[1].cv_id}&job=${jobId}`
    : ''

  const scoredApplications = ranking ? ranking.applications.filter((a) => a.status === 'scored') : []
  const hasNoApplications = ranking != null && ranking.total_applications === 0
  const isUnscorable =
    ranking != null && ranking.total_applications > 0 && scoredApplications.length === 0
  const showList = !hasNoApplications && !isUnscorable
  const hasPrev = offset > 0
  const hasNext = ranking != null && offset + ranking.returned_applications < ranking.total_applications
  const showPagination = ranking != null && ranking.total_applications > PAGE_SIZE

  return (
    <main className="page-container matches-page-container">
      <Link to="/jobs" className="link-button back-link">
        ← Back to jobs
      </Link>

      {toast && (
        <div className="page-banner success" role="status">
          <span>{toast}</span>
          <button
            type="button"
            className="page-banner-dismiss"
            aria-label="Dismiss message"
            onClick={() => setToast('')}
          >
            ×
          </button>
        </div>
      )}

      {status === 'loading' && (
        <section className="card simple-matches-card" aria-busy="true">
          <h1 className="page-title">Applications</h1>
          <div className="skeleton-simple-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} index={i} />
            ))}
          </div>
        </section>
      )}

      {status === 'error' && (
        <div className="card">
          <p className="upload-message error" role="alert">
            {errorMessage}
          </p>
          <button type="button" className="use-selected-job-button" onClick={() => loadPage(0, { initial: true })}>
            Retry
          </button>
        </div>
      )}

      {status === 'not_found' && (
        <div className="card">
          <h1 className="page-title">Job not found.</h1>
          <Link to="/jobs" className="use-selected-job-button">
            Back to jobs
          </Link>
        </div>
      )}

      {status === 'success' && ranking && (
        <section className="card simple-matches-card" aria-labelledby="matches-heading">
          <div className="page-header">
            <div>
              <h1 id="matches-heading" className="page-title">
                Applications
              </h1>
              <p className="page-subtitle">{ranking.job_title}</p>
            </div>
            <Link to={`/jobs/${jobId}`} className="link-button">
              View job
            </Link>
          </div>

          {showList && (
            <p className="matches-count">
              {ranking.total_applications} application{ranking.total_applications === 1 ? '' : 's'} ranked
            </p>
          )}

          {showList && scoredApplications.length > 1 && (
            <div className="compare-bar">
              <p className="compare-bar-hint" aria-live="polite">
                {compareReady
                  ? `${selected[0].candidate_name} vs ${selected[1].candidate_name}`
                  : 'Tick two candidates to see why one scores higher than the other.'}
              </p>
              <div className="compare-bar-actions">
                {selected.length > 0 && (
                  <button type="button" className="table-action-button" onClick={() => setSelected([])}>
                    Clear
                  </button>
                )}
                {compareReady ? (
                  <Link to={comparePath} className="use-selected-job-button compare-bar-button">
                    Compare these two
                  </Link>
                ) : (
                  <button type="button" className="use-selected-job-button compare-bar-button" disabled>
                    Compare these two
                  </button>
                )}
              </div>
            </div>
          )}

          {hasNoApplications && (
            <div className="table-empty-state">
              <p className="empty-hint">No one has applied to this job yet.</p>
              <p className="empty-hint">
                Add candidates in one of two ways: upload their CVs on the{' '}
                <Link to={`/jobs/${jobId}`}>job page</Link>, or upload on the{' '}
                <Link to={`/?job=${jobId}`}>dashboard</Link> and score the batch against this job. An
                existing candidate can also be added from the <Link to="/candidates">Candidates</Link> page.
              </p>
            </div>
          )}

          {isUnscorable && (
            <p className="empty-hint">
              This job does not have enough structured requirements for matching.
            </p>
          )}

          {showList && (
            <>
              {pageStatus === 'error' && (
                <div className="matches-page-error">
                  <p className="upload-message error" role="alert">
                    {pageErrorMessage}
                  </p>
                  <button type="button" className="use-selected-job-button" onClick={() => loadPage(offset)}>
                    Retry
                  </button>
                </div>
              )}

              {pageStatus === 'loading' ? (
                <div className="skeleton-simple-list">
                  {Array.from({ length: Math.max(1, ranking.returned_applications) }).map((_, i) => (
                    <SkeletonRow key={i} index={i} />
                  ))}
                </div>
              ) : (
                pageStatus !== 'error' && (
                  <ol className="simple-match-list" aria-label={`Application ranking for ${ranking.job_title}`}>
                    {scoredApplications.map((application) => (
                      <ApplicationRow
                        key={application.application_id}
                        application={application}
                        selected={selected.some((entry) => entry.cv_id === application.cv_id)}
                        selectionFull={selected.length === 2}
                        onToggleSelect={toggleSelect}
                        onAddToJob={(row) =>
                          setDialogCandidate({ id: row.candidate_id, full_name: row.candidate_name })
                        }
                      />
                    ))}
                  </ol>
                )
              )}

              {showPagination && (
                <div className="pagination">
                  <button
                    type="button"
                    disabled={!hasPrev || pageStatus === 'loading'}
                    onClick={() => loadPage(Math.max(offset - PAGE_SIZE, 0))}
                  >
                    Previous
                  </button>
                  <span>
                    Showing {offset + 1}-{offset + ranking.returned_applications} of {ranking.total_applications}
                  </span>
                  <button
                    type="button"
                    disabled={!hasNext || pageStatus === 'loading'}
                    onClick={() => loadPage(offset + PAGE_SIZE)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {dialogCandidate && (
        <AddToJobDialog
          candidate={dialogCandidate}
          excludeJobId={jobId}
          onClose={() => setDialogCandidate(null)}
          onDone={(result, job) => {
            setDialogCandidate(null)
            setToast(addToJobMessage(result, job))
          }}
        />
      )}
    </main>
  )
}

export default JobMatchesPage
