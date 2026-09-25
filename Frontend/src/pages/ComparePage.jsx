import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ComparePicker from '../components/ComparePicker'
import ComparisonCriteria from '../components/ComparisonCriteria'
import ComparisonProfile from '../components/ComparisonProfile'
import ComparisonSkills from '../components/ComparisonSkills'
import ComparisonVerdict from '../components/ComparisonVerdict'
import { fetchComparison } from '../lib/comparisonApi'
import { fetchJobs } from '../lib/jobsApi'

// The pair and the job context live in the URL, so a comparison can be
// bookmarked, reloaded and sent to a colleague - which is most of what a
// second opinion on two candidates is for.
function readId(params, key) {
  const raw = params.get(key)
  const value = Number(raw)
  return raw && Number.isInteger(value) && value > 0 ? value : null
}

function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const cvA = readId(searchParams, 'cv_a')
  const cvB = readId(searchParams, 'cv_b')
  const jobId = readId(searchParams, 'job')
  const hasPair = cvA != null && cvB != null

  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')
  const [comparison, setComparison] = useState(null)
  const [jobs, setJobs] = useState([])

  const load = () => {
    if (!hasPair) return
    setStatus('loading')
    setErrorMessage('')
    fetchComparison({ cvA, cvB, jobId })
      .then((data) => {
        setComparison(data)
        setStatus('success')
      })
      .catch((err) => {
        setErrorMessage(err.message)
        setStatus('error')
        setComparison(null)
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvA, cvB, jobId])

  // Only needed for the "compare against another job" control, so a failure
  // here leaves the comparison itself intact.
  useEffect(() => {
    if (!hasPair) return
    fetchJobs()
      .then((data) => setJobs(data.jobs))
      .catch(() => setJobs([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPair])

  const setPair = ({ cvA: nextA, cvB: nextB, jobId: nextJob }) => {
    const next = { cv_a: String(nextA), cv_b: String(nextB) }
    if (nextJob) next.job = String(nextJob)
    setSearchParams(next)
  }

  const swap = () => setPair({ cvA: cvB, cvB: cvA, jobId })

  const changeJob = (value) => {
    const next = { cv_a: String(cvA), cv_b: String(cvB) }
    if (value) next.job = value
    setSearchParams(next)
  }

  const clearPair = () => setSearchParams(jobId ? { job: String(jobId) } : {})

  if (!hasPair) {
    return (
      <main className="page-container matches-page-container">
        <Link to="/jobs" className="link-button back-link">
          ← Back to jobs
        </Link>
        <ComparePicker initialJobId={jobId ?? ''} onCompare={setPair} />
      </main>
    )
  }

  return (
    <main className="page-container matches-page-container compare-page">
      <Link to={jobId ? `/jobs/${jobId}/matches` : '/candidates'} className="link-button back-link">
        ← {jobId ? 'Back to the ranking' : 'Back to candidates'}
      </Link>

      <div className="compare-toolbar">
        <div className="form-field compare-toolbar-job">
          <label htmlFor="compare-job-select">Compare against</label>
          <select
            id="compare-job-select"
            value={jobId ?? ''}
            onChange={(event) => changeJob(event.target.value)}
          >
            <option value="">No job — profiles only</option>
            {jobs.map((job) => (
              <option key={job.job_id} value={job.job_id}>
                {job.title}
                {job.ready_to_match ? '' : ' (not ready to match)'}
              </option>
            ))}
          </select>
        </div>
        <div className="compare-toolbar-actions">
          <button type="button" className="table-action-button" onClick={swap}>
            Swap sides
          </button>
          <button type="button" className="table-action-button" onClick={clearPair}>
            Pick other CVs
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="card">
          <p className="empty-hint" aria-live="polite">
            Comparing…
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="card">
          <p className="upload-message error" role="alert">
            {errorMessage}
          </p>
          <button type="button" className="use-selected-job-button" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && comparison && (
        <>
          <ComparisonVerdict comparison={comparison} />
          <ComparisonCriteria comparison={comparison} />
          <ComparisonSkills comparison={comparison} />
          <ComparisonProfile comparison={comparison} />
        </>
      )}
    </main>
  )
}

export default ComparePage
