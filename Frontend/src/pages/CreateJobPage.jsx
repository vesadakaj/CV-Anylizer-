import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { analyzeJobPreview, createJob } from '../lib/jobsApi'
import { EDUCATION_OPTIONS, normalizeEducationOption } from '../lib/jobFormat'

function EditableListField({ id, label, items, onChange, placeholder, hint }) {
  const [draft, setDraft] = useState('')

  const addItem = () => {
    const value = draft.trim()
    if (!value) return
    onChange([...items, value])
    setDraft('')
  }

  const updateItem = (index, value) => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addItem()
    }
  }

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="field-hint">{hint}</p>}

      {items.length > 0 && (
        <ul className="editable-list">
          {items.map((item, index) => (
            <li key={index} className="editable-list-item">
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(index, e.target.value)}
                aria-label={`${label} item ${index + 1}`}
              />
              <button
                type="button"
                className="chip-remove"
                onClick={() => removeItem(index)}
                aria-label={`Remove ${label} item ${index + 1}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="skill-input-row">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <button type="button" className="table-action-button" onClick={addItem}>
          Add
        </button>
      </div>
    </div>
  )
}

function CreateJobPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState('input') // input | review
  const [description, setDescription] = useState('')
  const [analyzeStatus, setAnalyzeStatus] = useState('idle') // idle | loading | error
  const [analyzeError, setAnalyzeError] = useState('')

  const [title, setTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [location, setLocation] = useState('')
  const [department, setDepartment] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [postingDate, setPostingDate] = useState('')
  const [experience, setExperience] = useState('')
  const [education, setEducation] = useState('Not specified')
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState([])
  const [responsibilities, setResponsibilities] = useState([])
  const [requiredQualifications, setRequiredQualifications] = useState([])
  const [preferredQualifications, setPreferredQualifications] = useState([])

  const [errors, setErrors] = useState({})
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving
  const [apiError, setApiError] = useState('')

  const applyExtracted = (jobInfo) => {
    setTitle(jobInfo.title || '')
    setCompanyName(jobInfo.company_name || '')
    setLocation(jobInfo.location || '')
    setDepartment(jobInfo.department || '')
    setEmploymentType(jobInfo.employment_type || '')
    setPostingDate(jobInfo.posting_date || '')
    setExperience(
      jobInfo.required_experience_years != null ? String(jobInfo.required_experience_years) : '',
    )
    setEducation(normalizeEducationOption(jobInfo.required_education))
    setSkills(
      (jobInfo.skills || [])
        .filter((s) => s.is_required !== false)
        .map((s) => s.name)
        .filter(Boolean),
    )
    setResponsibilities(jobInfo.responsibilities || [])
    setRequiredQualifications(jobInfo.required_qualifications || [])
    setPreferredQualifications(jobInfo.preferred_qualifications || [])
    setErrors({})
  }

  const handleAnalyze = async (e) => {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed || analyzeStatus === 'loading') return

    setAnalyzeStatus('loading')
    setAnalyzeError('')

    try {
      const data = await analyzeJobPreview(trimmed)
      applyExtracted(data.job_info)
      setApiError('')
      setStep('review')
      setAnalyzeStatus('idle')
    } catch (err) {
      setAnalyzeStatus('error')
      setAnalyzeError(err.message)
    }
  }

  const addSkill = () => {
    const name = skillInput.trim()
    if (!name) return
    if (skills.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setSkillInput('')
      return
    }
    setSkills((prev) => [...prev, name])
    setSkillInput('')
    setErrors((prev) => ({ ...prev, skills: undefined }))
  }

  const removeSkill = (name) => {
    setSkills((prev) => prev.filter((s) => s !== name))
  }

  const handleSkillKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill()
    }
  }

  const validate = () => {
    const next = {}
    if (!title.trim()) next.title = 'Job title is required.'
    if (!companyName.trim()) next.companyName = 'Company is required.'

    const experienceNumber = Number(experience)
    if (experience === '' || Number.isNaN(experienceNumber) || experienceNumber < 0) {
      next.experience = 'Enter a required experience of 0 or more years.'
    }

    if (skills.length === 0) next.skills = 'Add at least one required skill.'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (saveStatus === 'saving') return
    if (!validate()) return

    setSaveStatus('saving')
    setApiError('')

    try {
      const job = await createJob({
        title: title.trim(),
        company_name: companyName.trim(),
        location: location.trim() || null,
        department: department.trim() || null,
        employment_type: employmentType.trim() || null,
        posting_date: postingDate || null,
        required_experience_years: Number(experience),
        required_education: education === 'Not specified' ? null : education,
        required_skills: skills,
        responsibilities,
        required_qualifications: requiredQualifications,
        preferred_qualifications: preferredQualifications,
        description: description.trim() || null,
      })
      navigate('/jobs', {
        state: { successMessage: `"${job.title}" was created and now appears in the jobs list.` },
      })
    } catch (err) {
      setApiError(err.message)
      setSaveStatus('idle')
    }
  }

  const handleBackToDescription = () => {
    setStep('input')
  }

  return (
    <main className="page-container">
      <Link to="/jobs" className="link-button back-link">
        ← Back to jobs
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Create Job</h1>
          <p className="page-subtitle">
            Paste a complete job posting and review the extracted requirements before saving.
          </p>
        </div>
      </div>

      {step === 'input' && (
        <form className="card create-job-form" onSubmit={handleAnalyze} noValidate>
          <div className="form-field">
            <label htmlFor="job-description-input">Paste a job description</label>
            <textarea
              id="job-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste the full job posting text here..."
              rows={16}
            />
          </div>

          {analyzeStatus === 'error' && (
            <p className="upload-message error" role="alert">
              {analyzeError}
            </p>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="use-selected-job-button"
              disabled={!description.trim() || analyzeStatus === 'loading'}
            >
              {analyzeStatus === 'loading' ? 'Analyzing…' : 'Analyze job'}
            </button>
          </div>
        </form>
      )}

      {step === 'review' && (
        <form className="card create-job-form" onSubmit={handleSave} noValidate>
          <p className="upload-message" role="status">
            Review the AI-extracted information before saving.
          </p>

          <div className="form-field">
            <label htmlFor="job-title">Job title</label>
            <input
              id="job-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Backend Developer"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'job-title-error' : undefined}
            />
            {errors.title && (
              <p id="job-title-error" className="field-error" role="alert">
                {errors.title}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="job-company">Company</label>
            <input
              id="job-company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Technologies"
              aria-invalid={Boolean(errors.companyName)}
              aria-describedby={errors.companyName ? 'job-company-error' : undefined}
            />
            {errors.companyName && (
              <p id="job-company-error" className="field-error" role="alert">
                {errors.companyName}
              </p>
            )}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="job-location">Location</label>
              <input
                id="job-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote"
              />
            </div>

            <div className="form-field">
              <label htmlFor="job-department">Department</label>
              <input
                id="job-department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Engineering"
              />
            </div>

            <div className="form-field">
              <label htmlFor="job-employment-type">Employment type</label>
              <input
                id="job-employment-type"
                type="text"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                placeholder="Full-time"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="job-experience">Required experience (years)</label>
              <input
                id="job-experience"
                type="number"
                min="0"
                step="0.5"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                placeholder="3"
                aria-invalid={Boolean(errors.experience)}
                aria-describedby={errors.experience ? 'job-experience-error' : undefined}
              />
              {errors.experience && (
                <p id="job-experience-error" className="field-error" role="alert">
                  {errors.experience}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="job-education">Required education</label>
              <select id="job-education" value={education} onChange={(e) => setEducation(e.target.value)}>
                {EDUCATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="job-posting-date">Posting date</label>
              <input
                id="job-posting-date"
                type="date"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="job-skill-input">Required skills</label>
            <div className="skill-input-row">
              <input
                id="job-skill-input"
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={handleSkillKeyDown}
                placeholder="Type a skill and press Enter"
                aria-describedby={errors.skills ? 'job-skills-error' : undefined}
              />
              <button type="button" className="table-action-button" onClick={addSkill}>
                Add
              </button>
            </div>

            {skills.length > 0 && (
              <div className="chip-row">
                {skills.map((name) => (
                  <span className="chip removable-chip" key={name}>
                    {name}
                    <button
                      type="button"
                      className="chip-remove"
                      onClick={() => removeSkill(name)}
                      aria-label={`Remove ${name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {errors.skills && (
              <p id="job-skills-error" className="field-error" role="alert">
                {errors.skills}
              </p>
            )}
          </div>

          <EditableListField
            id="job-responsibilities-input"
            label="What You'll Be Doing"
            items={responsibilities}
            onChange={setResponsibilities}
            placeholder="Add a responsibility"
          />

          <EditableListField
            id="job-required-qualifications-input"
            label="Required Qualifications"
            items={requiredQualifications}
            onChange={setRequiredQualifications}
            placeholder="Add a required qualification"
          />

          <EditableListField
            id="job-preferred-qualifications-input"
            label="In Addition, They May Have"
            items={preferredQualifications}
            onChange={setPreferredQualifications}
            placeholder="Add a preferred qualification"
            hint="Preferred qualifications are informational and never count toward the match score."
          />

          {apiError && (
            <p className="upload-message error" role="alert">
              {apiError}
            </p>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="table-action-button"
              onClick={handleBackToDescription}
              disabled={saveStatus === 'saving'}
            >
              Back to description
            </button>
            <button
              type="button"
              className="table-action-button"
              onClick={handleAnalyze}
              disabled={analyzeStatus === 'loading' || saveStatus === 'saving'}
            >
              {analyzeStatus === 'loading' ? 'Analyzing…' : 'Analyze again'}
            </button>
            <button type="submit" className="use-selected-job-button" disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? 'Saving…' : 'Save job'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}

export default CreateJobPage
