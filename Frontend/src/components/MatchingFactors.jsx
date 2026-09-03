import { CheckCircleIcon } from '../icons'
import { scoreLabel } from '../lib/scoreTier'

function MatchingFactors({ candidate }) {
  if (!candidate) {
    return (
      <section className="card matching-factors-card">
        <h2 className="card-title">Matching Factors</h2>
        <p className="empty-hint">
          Shows a breakdown for the top-ranked candidate once a job has been analyzed.
        </p>
      </section>
    )
  }

  const factors = []

  if (candidate.available_criteria.includes('skills')) {
    factors.push({
      label: 'Skills Match',
      detail: `${candidate.matched_required_skills_count} of ${candidate.total_required_skills} required skills`,
      score: candidate.skill_score,
    })
  }
  if (candidate.available_criteria.includes('experience')) {
    factors.push({
      label: 'Experience Match',
      detail: `${candidate.candidate_experience_years} yrs vs ${candidate.required_experience_years} yrs required`,
      score: candidate.experience_score,
    })
  }
  if (candidate.available_criteria.includes('education')) {
    factors.push({
      label: 'Education Match',
      detail: `${candidate.candidate_education_level || 'Unknown'} vs ${candidate.required_education_level} required`,
      score: candidate.education_score,
    })
  }

  return (
    <section className="card matching-factors-card">
      <h2 className="card-title">Matching Factors</h2>
      <p className="card-subtitle">Top candidate: {candidate.candidate_name}</p>

      {factors.length === 0 ? (
        <p className="empty-hint">
          This job has no structured requirements (skills, experience, education) to compare against.
        </p>
      ) : (
        <div className="factor-grid">
          {factors.map((factor) => (
            <div className="factor-item" key={factor.label}>
              <CheckCircleIcon className="factor-icon" />
              <div>
                <p className="factor-label">{factor.label}</p>
                <p className="factor-detail">{factor.detail}</p>
                <p className="factor-status">{scoreLabel(factor.score)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default MatchingFactors
