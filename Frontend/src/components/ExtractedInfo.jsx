import { useState } from 'react'
import { CheckCircleIcon, PinIcon } from '../icons'
import { initials } from '../lib/scoreTier'

const TABS = ['Personal Info', 'Experience', 'Education', 'Skills', 'Languages', 'Projects']

function ExtractedInfo({ candidate }) {
  const [tab, setTab] = useState(TABS[0])

  if (!candidate) {
    return (
      <section className="card extracted-info-card">
        <div className="card-header-row">
          <h2 className="card-title">Extracted Information</h2>
        </div>
        <p className="empty-hint">
          Select a completed CV from Recent Uploads to view its extracted information.
        </p>
      </section>
    )
  }

  const currentRole = candidate.work_experience?.[0]?.position_title

  return (
    <section className="card extracted-info-card">
      <div className="card-header-row">
        <h2 className="card-title">Extracted Information</h2>
        <span className="pill pill-success">
          <CheckCircleIcon width={14} height={14} />
          Analysis Complete
        </span>
      </div>

      <div className="candidate-identity">
        <span className="candidate-avatar">{initials(candidate.full_name)}</span>
        <div>
          <p className="candidate-fullname">{candidate.full_name}</p>
          {currentRole && <p className="candidate-role">{currentRole}</p>}
          <div className="candidate-contact-row">
            {candidate.email && <span>{candidate.email}</span>}
            {candidate.phone && <span>{candidate.phone}</span>}
            {candidate.location && (
              <span>
                <PinIcon width={13} height={13} /> {candidate.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab-button${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === 'Personal Info' && (
          <div className="info-columns">
            <div>
              <h3>Top Skills</h3>
              {candidate.skills.length ? (
                <div className="chip-row">
                  {candidate.skills.slice(0, 10).map((skill) => (
                    <span className="chip" key={skill.name}>
                      {skill.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="empty-hint">No skills extracted.</p>
              )}
            </div>
            <div>
              <h3>Languages</h3>
              {candidate.languages.length ? (
                <div className="chip-row">
                  {candidate.languages.map((lang) => (
                    <span className="chip" key={lang.name}>
                      {lang.name}
                      {lang.level ? ` (${lang.level})` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="empty-hint">No languages extracted.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'Experience' &&
          (candidate.work_experience.length ? (
            <ul className="detail-list">
              {candidate.work_experience.map((job, i) => (
                <li key={i}>
                  <p className="detail-title">
                    {job.position_title} · {job.company_name}
                  </p>
                  <p className="detail-meta">
                    {job.start_date || 'unknown'} – {job.is_current ? 'present' : job.end_date || 'unknown'}
                  </p>
                  {job.description && <p className="detail-description">{job.description}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-hint">No work experience extracted.</p>
          ))}

        {tab === 'Education' &&
          (candidate.education.length ? (
            <ul className="detail-list">
              {candidate.education.map((edu, i) => (
                <li key={i}>
                  <p className="detail-title">
                    {edu.degree || 'Degree'} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}
                  </p>
                  <p className="detail-meta">
                    {edu.institution} · {edu.start_date || 'unknown'} – {edu.end_date || 'unknown'}
                  </p>
                  {edu.description && <p className="detail-description">{edu.description}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-hint">No education extracted.</p>
          ))}

        {tab === 'Skills' &&
          (candidate.skills.length ? (
            <div className="chip-row">
              {candidate.skills.map((skill) => (
                <span className="chip" key={skill.name}>
                  {skill.name}
                  {skill.proficiency_level ? ` · ${skill.proficiency_level}` : ''}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty-hint">No skills extracted.</p>
          ))}

        {tab === 'Languages' &&
          (candidate.languages.length ? (
            <div className="chip-row">
              {candidate.languages.map((lang) => (
                <span className="chip" key={lang.name}>
                  {lang.name}
                  {lang.level ? ` (${lang.level})` : ''}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty-hint">No languages extracted.</p>
          ))}

        {tab === 'Projects' &&
          (candidate.projects.length ? (
            <ul className="detail-list">
              {candidate.projects.map((project, i) => (
                <li key={i}>
                  <p className="detail-title">{project.name}</p>
                  {project.technologies && <p className="detail-meta">{project.technologies}</p>}
                  {project.description && <p className="detail-description">{project.description}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-hint">No projects extracted.</p>
          ))}
      </div>
    </section>
  )
}

export default ExtractedInfo
