import { CheckCircleIcon } from '../icons'
import { scoreLabel } from '../lib/scoreTier'

function MatchingFactors({ candidate, loading = false, error = '' }) {
  if (loading) {
    return (
      <section className="card matching-factors-card">
        <h2 className="card-title">Matching Factors</h2>
        <p className="empty-hint" aria-live="polite">
          Loading breakdown…
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="card matching-factors-card">
        <h2 className="card-title">Matching Factors</h2>
        <p className="upload-message error" role="alert">
          {error}
        </p>
      </section>
    )
  }

  if (!candidate) {
    return (
      <section className="card matching-factors-card">
        <h2 className="card-title">Matching Factors</h2>
        <p className="empty-hint">
          Shows the breakdown for the application you pick in Candidate Match Results.
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

  const preferredTotal = candidate.total_preferred_skills || 0
  const preferredMatched = candidate.preferred_skills_matched?.length || 0

  return (
    <section className="card matching-factors-card">
      <h2 className="card-title">Matching Factors</h2>
      <p className="card-subtitle">
        {candidate.candidate_name} vs {candidate.job_title}
      </p>

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

      {preferredTotal > 0 && (
        <p className="factor-preferred">
          Also has {preferredMatched} of {preferredTotal} preferred skill{preferredTotal === 1 ? '' : 's'}
          {preferredMatched > 0 ? ` (${candidate.preferred_skills_matched.join(', ')})` : ''}. Preferred
          skills never count toward the score.
        </p>
      )}

      {candidate.missing_required_skills?.length > 0 && (
        <p className="factor-missing">Missing required skills: {candidate.missing_required_skills.join(', ')}</p>
      )}

      {candidate.explanation && <p className="factor-explanation">{candidate.explanation}</p>}
    </section>
  )
}

export default MatchingFactors
