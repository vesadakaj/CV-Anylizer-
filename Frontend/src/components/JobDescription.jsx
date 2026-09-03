import { useState } from 'react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

function JobDescription({ jobInfo, onAnalyzed }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const description = text.trim()
    if (!description) return

    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch(`${API_BASE}/api/jobs/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Could not analyze job description.')
      }

      setStatus('idle')
      onAnalyzed?.(data.job_id, data.job_info)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  return (
    <section className="card job-description-card">
      <h2 className="card-title">Job Description</h2>

      {jobInfo ? (
        <div className="job-summary">
          <p className="job-title">{jobInfo.title}</p>
          {jobInfo.company_name && <p className="job-meta">{jobInfo.company_name}</p>}

          {jobInfo.skills.length > 0 && (
            <>
              <p className="job-section-label">Required Skills:</p>
              <div className="chip-row">
                {jobInfo.skills.map((skill) => (
                  <span className="chip" key={skill.name}>
                    {skill.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {jobInfo.required_experience_years != null && (
            <p className="job-meta">Experience: {jobInfo.required_experience_years}+ years</p>
          )}
          {jobInfo.required_education && (
            <p className="job-meta">Education: {jobInfo.required_education}</p>
          )}

          <button type="button" className="link-button" onClick={() => onAnalyzed?.(null, null)}>
            Analyze a different job
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="job-form">
          <p className="card-subtitle">Paste a job description to extract its requirements</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full job posting text here…"
            rows={7}
          />
          <button type="submit" disabled={!text.trim() || status === 'loading'}>
            {status === 'loading' ? 'Analyzing…' : 'Analyze Job'}
          </button>
          {status === 'error' && <p className="upload-message error">{message}</p>}
        </form>
      )}
    </section>
  )
}

export default JobDescription
