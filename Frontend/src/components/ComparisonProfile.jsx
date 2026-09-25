import { advantageLabel, sideName } from '../lib/comparisonFormat'

// The unweighted, factual diff. It is the whole answer in profile mode and
// the context in job mode: two CVs can differ in ways a job never asked
// about, and hiding that would be its own kind of lie.
function ComparisonProfile({ comparison }) {
  return (
    <section className="card compare-profile-card" aria-labelledby="compare-profile-heading">
      <h2 id="compare-profile-heading" className="card-title">
        Profile differences
      </h2>
      <p className="card-subtitle">
        Straight from the two Profiles, with no weighting. "Ahead" here is a plain comparison, not a
        score.
      </p>
      <div className="table-scroll">
        <table className="jobs-table detail-table compare-profile-table">
          <thead>
            <tr>
              <th scope="col">&nbsp;</th>
              <th scope="col">{sideName(comparison, 'a')}</th>
              <th scope="col">{sideName(comparison, 'b')}</th>
              <th scope="col">Advantage</th>
            </tr>
          </thead>
          <tbody>
            {comparison.profile_differences.map((row) => (
              <tr key={row.label}>
                <td className="jobs-table-title">{row.label}</td>
                <td className={row.advantage === 'a' ? 'compare-cell-ahead' : undefined}>
                  {row.a_value}
                </td>
                <td className={row.advantage === 'b' ? 'compare-cell-ahead' : undefined}>
                  {row.b_value}
                </td>
                <td>
                  {row.advantage === 'none' ? (
                    <span className="table-muted">Different, not better</span>
                  ) : (
                    <span className={`pill compare-advantage side-${row.advantage}`}>
                      {advantageLabel(row.advantage, comparison)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default ComparisonProfile
