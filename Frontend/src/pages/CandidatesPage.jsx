import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SearchIcon } from '../icons'
import { fetchCandidates } from '../lib/candidatesApi'
import { formatDateTime } from '../lib/userFormat'

const PAGE_SIZE = 20
const COLUMNS = ['Name', 'Email', 'CVs', 'Applications', 'Last upload']

function CandidatesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') || ''
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

  const [draft, setDraft] = useState(search)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')
  const [data, setData] = useState(null)

  // The query lives in the URL so a reload or the back button keeps it.
  const updateParams = (patch) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === '' || value === 0) next.delete(key)
      else next.set(key, String(value))
    })
    setSearchParams(next, { replace: true })
  }

  // Debounced: typing updates the URL 300ms after the last keystroke.
  useEffect(() => {
    if (draft === search) return undefined
    const timer = setTimeout(() => updateParams({ search: draft.trim(), offset: 0 }), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const load = () => {
    setStatus('loading')
    setErrorMessage('')
    fetchCandidates({ search, limit: PAGE_SIZE, offset })
      .then((result) => {
        setData(result)
        setStatus('success')
      })
      .catch((err) => {
        setErrorMessage(err.message)
        setStatus('error')
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, offset])

  const candidates = data?.candidates || []
  const total = data?.total || 0
  const hasPrev = offset > 0
  const hasNext = offset + candidates.length < total

  return (
    <main className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Candidates</h1>
          <p className="page-subtitle">
            Everyone whose CV has been uploaded. People are merged by email; a CV without one is its own
            candidate.
          </p>
        </div>

        <div className="page-header-controls">
          <div className="search-field">
            <SearchIcon width={16} height={16} aria-hidden="true" className="search-field-icon" />
            <label htmlFor="candidates-search" className="visually-hidden">
              Search candidates by name or email
            </label>
            <input
              id="candidates-search"
              type="search"
              placeholder="Search by name or email…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card jobs-table-card">
        <div aria-live="polite">
          {status === 'loading' && (
            <div className="table-scroll">
              <table className="jobs-table" aria-busy="true">
                <caption className="visually-hidden">Loading candidates…</caption>
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {COLUMNS.map((column) => (
                        <td key={column}>
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
              <button type="button" className="use-selected-job-button" onClick={load}>
                Retry
              </button>
            </div>
          )}

          {status === 'success' && candidates.length === 0 && (
            <div className="table-empty-state">
              <p className="empty-hint">
                {search ? 'No candidates match your search.' : 'No CVs have been uploaded yet.'}
              </p>
              {search ? (
                <button type="button" className="link-button" onClick={() => setDraft('')}>
                  Clear search
                </button>
              ) : (
                <Link to="/" className="use-selected-job-button">
                  Upload CVs on the dashboard
                </Link>
              )}
            </div>
          )}

          {status === 'success' && candidates.length > 0 && (
            <>
              <div className="table-scroll">
                <table className="jobs-table">
                  <caption className="visually-hidden">Candidates, their CVs and applications</caption>
                  <thead>
                    <tr>
                      {COLUMNS.map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td className="jobs-table-title">
                          <Link to={`/candidates/${candidate.id}`} className="table-link">
                            {candidate.full_name}
                          </Link>
                          {!candidate.linkable && (
                            <span
                              className="users-flag"
                              title="No email address was found, so this candidate can never be merged with another CV."
                            >
                              Unlinkable
                            </span>
                          )}
                        </td>
                        <td>{candidate.email || <span className="table-muted">No email</span>}</td>
                        <td>{candidate.cv_count}</td>
                        <td>
                          {candidate.application_count}
                          {candidate.application_count === 0 && (
                            <span className="pill pill-neutral table-inline-pill">Unattached</span>
                          )}
                        </td>
                        <td>{formatDateTime(candidate.last_uploaded_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => updateParams({ offset: Math.max(0, offset - PAGE_SIZE) })}
                >
                  Previous
                </button>
                <span>
                  Showing {offset + 1} to {offset + candidates.length} of {total} candidate{total === 1 ? '' : 's'}
                </span>
                <button type="button" disabled={!hasNext} onClick={() => updateParams({ offset: offset + PAGE_SIZE })}>
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

export default CandidatesPage
