import { sideName } from '../lib/comparisonFormat'

function SkillChips({ names, tone }) {
  if (names.length === 0) return <span className="compare-skill-none">—</span>
  return (
    <span className="compare-skill-chips">
      {names.map((name) => (
        <span key={name} className={`skill-chip compare-skill-chip ${tone}`}>
          {name}
        </span>
      ))}
    </span>
  )
}

function SkillGroup({ group, aName, bName }) {
  return (
    <div className="compare-skill-group">
      <h3 className="compare-skill-title">{group.label}</h3>
      <div className="compare-skill-columns">
        <div className="compare-skill-column">
          <p className="compare-skill-heading">Only {aName}</p>
          <SkillChips names={group.only_a} tone="side-a" />
        </div>
        <div className="compare-skill-column">
          <p className="compare-skill-heading">Both</p>
          <SkillChips names={group.both} tone="shared" />
        </div>
        <div className="compare-skill-column">
          <p className="compare-skill-heading">Only {bName}</p>
          <SkillChips names={group.only_b} tone="side-b" />
        </div>
      </div>
      {group.neither.length > 0 && (
        <p className="compare-skill-neither">
          Neither CV has: {group.neither.join(', ')}
        </p>
      )}
    </div>
  )
}

function ComparisonSkills({ comparison }) {
  const aName = sideName(comparison, 'a')
  const bName = sideName(comparison, 'b')
  const groups = comparison.skill_groups.filter(
    (group) => group.only_a.length || group.only_b.length || group.both.length || group.neither.length,
  )

  return (
    <section className="card compare-skills-card" aria-labelledby="compare-skills-heading">
      <h2 id="compare-skills-heading" className="card-title">
        Skills side by side
      </h2>
      <p className="card-subtitle">
        Only the job's required skills move the score. Preferred and other skills are shown because
        a person reading two CVs wants them, and are never counted.
      </p>
      {groups.length === 0 ? (
        <p className="empty-hint">Neither CV lists any skills.</p>
      ) : (
        groups.map((group) => (
          <SkillGroup key={group.kind} group={group} aName={aName} bName={bName} />
        ))
      )}
    </section>
  )
}

export default ComparisonSkills
