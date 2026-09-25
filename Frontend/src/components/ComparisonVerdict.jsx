import { Link } from 'react-router-dom'
import { formatScore, marginLabel, verdictHeadline } from '../lib/comparisonFormat'
import { initials, scoreTierClass } from '../lib/scoreTier'

// One CV of the pair. The score is only shown when a Job was scored against;
// in profile mode there is deliberately nothing to show there.
function SideHead({ side, isWinner, jobId }) {
  return (
    <div className={`compare-head${isWinner ? ' winner' : ''}`}>
      <span className="compare-head-avatar" aria-hidden="true">
        {initials(side.candidate_name)}
      </span>
      <Link to={`/candidates/${side.candidate_id}`} className="compare-head-name">
        {side.candidate_name}
      </Link>
      <span className="compare-head-file" title={side.file_name}>
        {side.file_name}
      </span>
      {side.overall_score != null ? (
        <span className={`compare-head-score ${scoreTierClass(side.overall_score)}`}>
          {formatScore(side.overall_score)}
        </span>
      ) : (
        <span className="compare-head-score unscored">Not scored</span>
      )}
      {isWinner && <span className="compare-head-flag">Stronger match</span>}
      {side.application_id != null && jobId != null && (
        <Link to={`/jobs/${jobId}/matches`} className="compare-head-link">
          In this job's ranking
        </Link>
      )}
    </div>
  )
}

function ComparisonVerdict({ comparison }) {
  const margin = marginLabel(comparison.margin)
  const winner = comparison.winner

  return (
    <section className="card compare-verdict-card" aria-labelledby="compare-verdict-heading">
      <h1 id="compare-verdict-heading" className="page-title">
        {verdictHeadline(comparison)}
      </h1>
      <p className="page-subtitle">
        {comparison.mode === 'job'
          ? `Scored against ${comparison.job_title}`
          : 'No job selected — profiles only, nothing is scored'}
      </p>

      <div className="compare-heads">
        <SideHead side={comparison.a} isWinner={winner === 'a'} jobId={comparison.job_id} />
        <div className="compare-versus">
          <span className="compare-versus-mark" aria-hidden="true">
            vs
          </span>
          {margin && <span className="compare-margin-pill">{margin}</span>}
        </div>
        <SideHead side={comparison.b} isWinner={winner === 'b'} jobId={comparison.job_id} />
      </div>

      <p className="compare-summary">{comparison.summary}</p>
    </section>
  )
}

export default ComparisonVerdict
