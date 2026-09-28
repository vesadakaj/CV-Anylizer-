import {
  contributionWidth,
  formatPoints,
  formatScore,
  maxContribution,
  sideName,
} from '../lib/comparisonFormat'
import { clampPercent } from '../lib/scoreTier'

// One criterion of the Job. The two bars grow away from the centre line, so
// which side is longer *is* the answer; the chip on the right says how many
// points of the overall gap that difference is worth.
function CriterionRow({ row, aName, bName, widest }) {
  const aWidth = clampPercent(row.a_score)
  const bWidth = clampPercent(row.b_score)
  const share = contributionWidth(row.contribution_delta, widest)

  return (
    <li className="compare-criterion">
      <div className="compare-criterion-head">
        <span className="compare-criterion-label">{row.label}</span>
        <span className="compare-criterion-weight">{Math.round(row.weight)}% of the score</span>
        <span className={`compare-contribution side-${row.winner}`}>
          {formatPoints(row.contribution_delta)} pts
        </span>
      </div>

      <div
        className="compare-mirror"
        role="img"
        aria-label={`${row.label}: ${aName} ${formatScore(row.a_score)} (${row.a_detail}), ${bName} ${formatScore(row.b_score)} (${row.b_detail})`}
      >
        <div className="compare-mirror-half left">
          <span className="compare-mirror-value">{formatScore(row.a_score)}</span>
          <div className="compare-mirror-track">
            <div className="compare-mirror-fill side-a" style={{ width: `${aWidth}%` }} />
          </div>
        </div>
        <div className="compare-mirror-half right">
          <div className="compare-mirror-track">
            <div className="compare-mirror-fill side-b" style={{ width: `${bWidth}%` }} />
          </div>
          <span className="compare-mirror-value">{formatScore(row.b_score)}</span>
        </div>
      </div>

      <div className="compare-criterion-details">
        <span className="compare-detail left">{row.a_detail}</span>
        <span className="compare-detail-share" aria-hidden="true">
          <span
            className={`compare-share-bar side-${row.winner}`}
            style={{ width: `${share}%` }}
          />
        </span>
        <span className="compare-detail right">{row.b_detail}</span>
      </div>
    </li>
  )
}

function ComparisonCriteria({ comparison }) {
  const { criteria, decisive_factors: factors } = comparison
  const aName = sideName(comparison, 'a')
  const bName = sideName(comparison, 'b')

  if (comparison.mode !== 'job') {
    return (
      <section className="card compare-criteria-card">
        <h2 className="card-title">Why one is better</h2>
        <p className="empty-hint">
          Pick a job in the list. A score only means something against requirements, so without one there
          is nothing to attribute — the factual differences are below.
        </p>
      </section>
    )
  }

  if (criteria.length === 0) {
    return (
      <section className="card compare-criteria-card">
        <h2 className="card-title">Why one is better</h2>
        <p className="empty-hint">
          This job has no structured requirement to score against (no required skills, no valid
          required experience, no recognisable education level), so neither CV can be called the
          better match. The factual differences are below.
        </p>
      </section>
    )
  }

  const widest = maxContribution(criteria)

  return (
    <section className="card compare-criteria-card" aria-labelledby="compare-why-heading">
      <h2 id="compare-why-heading" className="card-title">
        Why one is better
      </h2>
      <p className="card-subtitle">
        Each criterion carries the weight this job gives it — the same weight for both CVs — so the
        points below add up to the {Math.abs(comparison.score_delta ?? 0).toFixed(1)}-point gap.
        Positive is {aName}; negative is {bName}.
      </p>

      <ul className="compare-criteria">
        {criteria.map((row) => (
          <CriterionRow key={row.criterion} row={row} aName={aName} bName={bName} widest={widest} />
        ))}
      </ul>

      {factors.length > 0 && (
        <ul className="compare-factors">
          {factors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ComparisonCriteria
