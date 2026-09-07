import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FilterIcon, PlusIcon, SearchIcon } from '../icons'
import { fetchJobs } from '../lib/jobsApi'
import { formatDate, formatExperience } from '../lib/jobFormat'

const PAGE_SIZE = 10

const DEFAULT_FILTERS = {
  readiness: 'all', // all | ready | missing
  minExperience: '',
  maxExperience: '',
  skill: '',
}

function JobsPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')
  const [jobs, setJobs] = useState([])
  const [totalCandidates, setTotalCandidates] = useState(0)

  const [searchText, setSearchText] = useState('')
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [page, setPage] = useState(1)

  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage ?? '')

  const loadJobs = () => {
    setStatus('loading')
    setErrorMessage('')
    fetchJobs()
      .then((data) => {
        setJobs(data.jobs)
        setTotalCandidates(data.total_candidates)
        setStatus('success')
      })
      .catch((err) => {
        setErrorMessage(err.message)
        setStatus('error')
      })
  }

  useEffect(() => {
    loadJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear the navigation-passed success message from history so a page
  // refresh doesn't re-show it, while keeping it in local state to render.
  useEffect(() => {
    if (location.state?.successMessage) {
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const availableSkills = useMemo(() => {
    const names = new Set()
    jobs.forEach((job) => job.skills.forEach((skill) => names.add(skill.name)))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [jobs])

  const activeFilterCount = Object.keys(DEFAULT_FILTERS).filter(
    (key) => appliedFilters[key] !== DEFAULT_FILTERS[key],
  ).length

  const filteredJobs = useMemo(() => {
    const term = searchText.trim().toLowerCase()

    return jobs.filter((job) => {
      if (term) {
        const haystack = [job.title, job.company_name, ...job.skills.map((s) => s.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }

      if (appliedFilters.readiness === 'ready' && !job.ready_to_match) return false
      if (appliedFilters.readiness === 'missing' && job.ready_to_match) return false

      if (
        appliedFilters.minExperience !== '' &&
        !(job.required_experience_years >= Number(appliedFilters.minExperience))
      ) {
        return false
      }
      if (
        appliedFilters.maxExperience !== '' &&
        !(job.required_experience_years <= Number(appliedFilters.maxExperience))
      ) {
        return false
      }

      if (appliedFilters.skill && !job.skills.some((s) => s.name === appliedFilters.skill)) {
        return false
      }

      return true
    })
  }, [jobs, searchText, appliedFilters])

  useEffect(() => {
    setPage(1)
  }, [searchText, appliedFilters])

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)
  const startIndex = (clampedPage - 1) * PAGE_SIZE
  const pageJobs = filteredJobs.slice(startIndex, startIndex + PAGE_SIZE)

  const openFilterPanel = () => {
    setDraftFilters(appliedFilters)
    setFilterPanelOpen(true)
  }

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters)
    setFilterPanelOpen(false)
  }

  const handleClearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    setFilterPanelOpen(false)
  }

  const handleClearSearchAndFilters = () => {
    setSearchText('')
    handleClearFilters()
  }

  const hasAnyJobs = jobs.length > 0
  const hasVisibleJobs = filteredJobs.length > 0

  return (
    <main className="page-container">
      {successMessage && (
        <div className="page-banner success" role="status">
          <span>{successMessage}</span>
          <button
            type="button"
            className="page-banner-dismiss"
            aria-label="Dismiss message"
            onClick={() => setSuccessMessage('')}
          >
            ×
          </button>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">Manage job positions and matching criteria.</p>
        </div>

        <div className="page-header-controls">
          <div className="search-field">
            <SearchIcon width={16} height={16} aria-hidden="true" className="search-field-icon" />
            <label htmlFor="jobs-search" className="visually-hidden">
              Search jobs by title, company, or skill
            </label>
            <input
              id="jobs-search"
              type="search"
              placeholder="Search jobs…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <div className="filter-anchor">
            <button
              type="button"
              className="filter-button"
              aria-expanded={filterPanelOpen}
              aria-controls="jobs-filter-panel"
              onClick={() => (filterPanelOpen ? setFilterPanelOpen(false) : openFilterPanel())}
            >
              <FilterIcon width={16} height={16} aria-hidden="true" />
              <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            </button>

            {filterPanelOpen && (
              <div className="filter-panel" id="jobs-filter-panel" role="region" aria-label="Filter jobs">
                <div className="filter-group">
                  <span className="filter-group-label" id="filter-readiness-label">
                    Match readiness
                  </span>
                  <div role="radiogroup" aria-labelledby="filter-readiness-label" className="filter-radio-row">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'ready', label: 'Ready to match' },
                      { value: 'missing', label: 'Missing requirements' },
                    ].map((opt) => (
                      <label key={opt.value} className="filter-radio">
                        <input
                          type="radio"
                          name="readiness"
                          value={opt.value}
                          checked={draftFilters.readiness === opt.value}
                          onChange={() => setDraftFilters((f) => ({ ...f, readiness: opt.value }))}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="filter-group">
                  <span className="filter-group-label" id="filter-experience-label">
                    Required experience (years)
                  </span>
                  <div className="filter-range-row" role="group" aria-labelledby="filter-experience-label">
                    <label className="visually-hidden" htmlFor="filter-min-exp">
                      Minimum required experience in years
                    </label>
                    <input
                      id="filter-min-exp"
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={draftFilters.minExperience}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, minExperience: e.target.value }))}
                    />
                    <span aria-hidden="true">to</span>
                    <label className="visually-hidden" htmlFor="filter-max-exp">
                      Maximum required experience in years
                    </label>
                    <input
                      id="filter-max-exp"
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={draftFilters.maxExperience}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, maxExperience: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="filter-group">
                  <label className="filter-group-label" htmlFor="filter-skill">
                    Required skill
                  </label>
                  <select
                    id="filter-skill"
                    value={draftFilters.skill}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, skill: e.target.value }))}
                  >
                    <option value="">Any skill</option>
                    {availableSkills.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-actions">
                  <button type="button" className="link-button" onClick={handleClearFilters}>
                    Clear filters
                  </button>
                  <button type="button" className="use-selected-job-button" onClick={handleApplyFilters}>
                    Apply filters
                  </button>
                </div>
              </div>
            )}
          </div>

          <Link to="/jobs/new" className="create-job-button">
            <PlusIcon width={16} height={16} aria-hidden="true" />
            <span>Create job</span>
          </Link>
        </div>
      </div>

      <div className="card jobs-table-card">
        <div aria-live="polite">
          {status === 'loading' && (
            <div className="table-scroll">
              <table className="jobs-table" aria-busy="true">
                <caption className="visually-hidden">Loading jobs…</caption>
                <thead>
                  <tr>
                    <th scope="col">Job title</th>
                    <th scope="col">Company</th>
                    <th scope="col">Required experience</th>
                    <th scope="col">Required skills</th>
                    <th scope="col">Status</th>
                    <th scope="col">Posting date</th>
                    <th scope="col">Candidates</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 8 }).map((__, cellIndex) => (
                        <td key={cellIndex}>
                          <span className="skeleton-bar" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {status === 'error' && (
            <div className="table-empty-state">
              <p className="upload-message error">{errorMessage}</p>
              <button type="button" className="use-selected-job-button" onClick={loadJobs}>
                Retry
              </button>
            </div>
          )}

          {status === 'success' && !hasAnyJobs && (
            <div className="table-empty-state">
              <p className="empty-hint">No jobs have been created yet.</p>
              <Link to="/jobs/new" className="use-selected-job-button">
                Create your first job
              </Link>
            </div>
          )}

          {status === 'success' && hasAnyJobs && !hasVisibleJobs && (
            <div className="table-empty-state">
              <p className="empty-hint">No jobs match your search or filters.</p>
              <button type="button" className="link-button" onClick={handleClearSearchAndFilters}>
                Clear search and filters
              </button>
            </div>
          )}

          {status === 'success' && hasVisibleJobs && (
            <>
              <div className="table-scroll">
                <table className="jobs-table">
                  <caption className="visually-hidden">Jobs and their matching readiness</caption>
                  <thead>
                    <tr>
                      <th scope="col">Job title</th>
                      <th scope="col">Company</th>
                      <th scope="col">Required experience</th>
                      <th scope="col">Required skills</th>
                      <th scope="col">Status</th>
                      <th scope="col">Posting date</th>
                      <th scope="col">Candidates</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageJobs.map((job) => (
                      <tr key={job.job_id}>
                        <td className="jobs-table-title">{job.title}</td>
                        <td>{job.company_name || 'Not specified'}</td>
                        <td>{formatExperience(job.required_experience_years)}</td>
                        <td>
                          {job.required_skills_count > 0 ? (
                            <div className="chip-row jobs-table-skills">
                              {job.skills
                                .filter((s) => s.is_required)
                                .slice(0, 3)
                                .map((s) => (
                                  <span className="chip" key={s.name}>
                                    {s.name}
                                  </span>
                                ))}
                              {job.required_skills_count > 3 && (
                                <span className="chip">+{job.required_skills_count - 3} more</span>
                              )}
                            </div>
                          ) : (
                            'None specified'
                          )}
                        </td>
                        <td>
                          <span className={`pill ${job.ready_to_match ? 'pill-success' : 'pill-warning'}`}>
                            {job.ready_to_match ? 'Ready to match' : 'Missing requirements'}
                          </span>
                        </td>
                        <td>{formatDate(job.posting_date)}</td>
                        <td>{totalCandidates}</td>
                        <td>
                          <div className="jobs-row-actions">
                            <button
                              type="button"
                              className="table-action-button"
                              onClick={() => navigate(`/jobs/${job.job_id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="table-action-button"
                              onClick={() => navigate(`/jobs/${job.job_id}/matches`)}
                            >
                              View matches
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="table-note">
                "Candidates" is the total number of candidates currently in the system — every job
                is ranked against the same pool.
              </p>

              <div className="pagination">
                <button type="button" disabled={clampedPage === 1} onClick={() => setPage(clampedPage - 1)}>
                  Previous
                </button>
                <span>
                  Showing {startIndex + 1} to {Math.min(startIndex + PAGE_SIZE, filteredJobs.length)} of{' '}
                  {filteredJobs.length} jobs
                </span>
                <button
                  type="button"
                  disabled={clampedPage === totalPages}
                  onClick={() => setPage(clampedPage + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default JobsPage
