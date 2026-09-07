import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

function CandidateRow({ candidate }) {
  const tier = scoreTierClass(candidate.overall_score)
  const displayScore = Math.round(candidate.overall_score ?? 0)
  const barWidth = clampPercent(candidate.overall_score)
  const rankClass = candidate.rank === 1 ? ' first' : candidate.rank <= 3 ? ' top' : ''

  return (
    <li className="simple-match-item">
      <span className={`simple-match-rank${rankClass}`}>{candidate.rank}</span>
      <span className="simple-match-avatar" aria-hidden="true">
        {initials(candidate.candidate_name)}
      </span>
      <span className="simple-match-name">{candidate.candidate_name}</span>
      <div
        className="match-bar-track simple-match-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(barWidth)}
        aria-label={`${candidate.candidate_name}: ${displayScore}% match`}
      >
        <div className={`match-bar-fill ${tier}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className={`simple-match-score ${tier}`} aria-hidden="true">
        {displayScore}% match
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

  const scoredCandidates = ranking ? ranking.candidates.filter((c) => c.status === 'scored') : []
  const hasNoCandidates = ranking != null && ranking.total_candidates === 0
  const isUnscorable = ranking != null && ranking.total_candidates > 0 && scoredCandidates.length === 0
  const showList = !hasNoCandidates && !isUnscorable
  const hasPrev = offset > 0
  const hasNext = ranking != null && offset + ranking.returned_candidates < ranking.total_candidates
  const showPagination = ranking != null && ranking.total_candidates > PAGE_SIZE

  return (
    <main className="page-container matches-page-container">
      <Link to="/jobs" className="link-button back-link">
        ← Back to jobs
      </Link>

      {status === 'loading' && (
        <section className="card simple-matches-card" aria-busy="true">
          <h1 className="page-title">Candidate matches</h1>
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
          <h1 id="matches-heading" className="page-title">
            Candidate matches
          </h1>
          <p className="page-subtitle">{ranking.job_title}</p>

          {showList && (
            <p className="matches-count">
              {ranking.total_candidates} candidate{ranking.total_candidates === 1 ? '' : 's'} ranked
            </p>
          )}

          {hasNoCandidates && (
            <p className="empty-hint">No candidates are available for this job.</p>
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
                  {Array.from({ length: Math.max(1, ranking.returned_candidates) }).map((_, i) => (
                    <SkeletonRow key={i} index={i} />
                  ))}
                </div>
              ) : (
                pageStatus !== 'error' && (
                  <ol className="simple-match-list" aria-label={`Candidate ranking for ${ranking.job_title}`}>
                    {scoredCandidates.map((candidate) => (
                      <CandidateRow key={candidate.candidate_id} candidate={candidate} />
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
                    Showing {offset + 1}-{offset + ranking.returned_candidates} of {ranking.total_candidates}
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
    </main>
  )
}

export default JobMatchesPage
