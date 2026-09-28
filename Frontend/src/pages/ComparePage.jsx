import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CompareJobRail from '../components/CompareJobRail'
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
  const [jobsStatus, setJobsStatus] = useState('loading') // loading | success | error
  const [jobsError, setJobsError] = useState('')

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

  // The job rail is shown in both states. A failure here is reported in the
  // rail and leaves the comparison itself intact.
  const loadJobs = () => {
    setJobsStatus('loading')
    setJobsError('')
    fetchJobs()
      .then((data) => {
        setJobs(data.jobs)
        setJobsStatus('success')
      })
      .catch((err) => {
        setJobsError(err.message)
        setJobsStatus('error')
      })
  }

  useEffect(() => {
    loadJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setPair = ({ cvA: nextA, cvB: nextB, jobId: nextJob }) => {
    const next = { cv_a: String(nextA), cv_b: String(nextB) }
    if (nextJob) next.job = String(nextJob)
    setSearchParams(next)
  }

  const swap = () => setPair({ cvA: cvB, cvB: cvA, jobId })

  const changeJob = (id) => {
    const next = { cv_a: String(cvA), cv_b: String(cvB) }
    if (id) next.job = String(id)
    setSearchParams(next)
  }

  // Before a pair exists the job only says whose Applications to pick
  // from, so choosing one replaces the history entry instead of adding one.
  const pickJob = (id) => setSearchParams({ job: String(id) }, { replace: true })

  const clearPair = () => setSearchParams(jobId ? { job: String(jobId) } : {})

  const rail = (
    <CompareJobRail
      jobs={jobs}
      status={jobsStatus}
      error={jobsError}
      onRetry={loadJobs}
      selectedJobId={jobId}
      onSelect={hasPair ? changeJob : pickJob}
      mode={hasPair ? 'score' : 'pick'}
    />
  )

  if (!hasPair) {
    return (
      <main className="page-container compare-layout">
        <div className="compare-rail-column">
          <Link to="/jobs" className="link-button back-link">
            ← Back to jobs
          </Link>
          {rail}
        </div>
        <div className="compare-main-column">
          <ComparePicker
            key={jobId ?? 'none'}
            jobId={jobId}
            job={jobs.find((job) => job.job_id === jobId)}
            onCompare={setPair}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="page-container compare-layout compare-page">
      <div className="compare-rail-column">
        <Link to={jobId ? `/jobs/${jobId}/matches` : '/candidates'} className="link-button back-link">
          ← {jobId ? 'Back to the ranking' : 'Back to candidates'}
        </Link>
        {rail}
      </div>

      <div className="compare-main-column">
        <div className="compare-toolbar-actions">
          <button type="button" className="table-action-button" onClick={swap}>
            Swap sides
          </button>
          <button type="button" className="table-action-button" onClick={clearPair}>
            Pick other CVs
          </button>
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
      </div>
    </main>
  )
}

export default ComparePage
