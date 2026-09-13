import { Link } from 'react-router-dom'
import { clampPercent, initials, scoreTierClass } from '../lib/scoreTier'

// The batch ranking: the rows that came back from "Score N CVs against
// <job>", ordered by score. Clicking a row picks the Application whose
// breakdown Matching Factors shows.
function CandidateMatches({
  hasJob,
  batch, // { jobId, jobTitle, rows: ApplicationRow[] } | null
  status = 'idle', // idle | scoring | error | success
  error = '',
  selectedApplicationId = null,
  onSelectApplication,
}) {
  const ranked = batch
    ? [...batch.rows]
        .sort((a, b) => {
          const sa = a.match?.overall_score
          const sb = b.match?.overall_score
          if (sa == null && sb == null) return a.candidate_name.localeCompare(b.candidate_name)
          if (sa == null) return 1
          if (sb == null) return -1
          if (sb !== sa) return sb - sa
          return a.application_id - b.application_id
        })
        .map((row, index) => ({ ...row, rank: index + 1 }))
    : []

  return (
    <section className="card matches-card">
      <div className="card-header-row">
        <h2 className="card-title">Candidate Match Results</h2>
        {batch && (
          <Link to={`/jobs/${batch.jobId}/matches`} className="link-button">
            All applications for this job
          </Link>
        )}
      </div>

      {status === 'idle' && !batch && !hasJob && (
        <p className="empty-hint">
          Upload CVs, choose a job in the Job Description card, then score the batch to see a ranking here.
        </p>
      )}

      {status === 'idle' && !batch && hasJob && (
        <p className="empty-hint">
          Tick the CVs to include in Recent Uploads and press the score button in the Job Description card.
        </p>
      )}

      {status === 'scoring' && (
        <p className="empty-hint" aria-live="polite">
          Scoring the batch…
        </p>
      )}

      {status === 'error' && (
        <p className="upload-message error" role="alert">
          {error}
        </p>
      )}

      {status === 'success' && batch && (
        <>
          <p className="card-subtitle">
            {ranked.length} CV{ranked.length === 1 ? '' : 's'} scored against {batch.jobTitle}. Click a row for its
            breakdown.
          </p>
          <ol className="batch-list" aria-label={`Batch ranking for ${batch.jobTitle}`}>
            {ranked.map((row) => {
              const score = row.match?.overall_score
              const scored = row.match?.status === 'scored' && score != null
              const tier = scoreTierClass(scored ? score : null)
              const isSelected = row.application_id === selectedApplicationId
              const rankClass = row.rank === 1 ? ' first' : row.rank <= 3 ? ' top' : ''
              return (
                <li key={row.application_id}>
                  <button
                    type="button"
                    className={`batch-item${isSelected ? ' selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectApplication?.(row.application_id)}
                  >
                    <span className={`simple-match-rank${rankClass}`}>{row.rank}</span>
                    <span className="simple-match-avatar" aria-hidden="true">
                      {initials(row.candidate_name)}
                    </span>
                    <span className="batch-item-name">
                      <span className="simple-match-name">{row.candidate_name}</span>
                      <span className={`batch-chip ${row.status === 'updated' ? 'batch-chip-updated' : ''}`}>
                        {row.status === 'updated' ? 'Updated' : 'Created'}
                      </span>
                    </span>
                    <span
                      className="match-bar-track simple-match-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(clampPercent(score))}
                      aria-label={`${row.candidate_name}: ${scored ? `${Math.round(score)}% match` : 'unscorable'}`}
                    >
                      <span className={`match-bar-fill ${tier}`} style={{ width: `${clampPercent(score)}%` }} />
                    </span>
                    <span className={`simple-match-score ${tier}`} aria-hidden="true">
                      {scored ? `${Math.round(score)}% match` : 'Unscorable'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

export default CandidateMatches
