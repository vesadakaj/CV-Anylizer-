import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import UploadResume from '../components/UploadResume'
import RecentUploads from '../components/RecentUploads'
import ExtractedInfo from '../components/ExtractedInfo'
import JobDescription from '../components/JobDescription'
import CandidateMatches from '../components/CandidateMatches'
import MatchingFactors from '../components/MatchingFactors'
import { fetchCv, fetchUnattachedCvs } from '../lib/cvApi'
import { fetchApplicationMatch, fetchJob, scoreCvsAgainstJob } from '../lib/jobsApi'
import { useCvUploadQueue } from '../lib/useCvUploadQueue'
import { parseServerDate } from '../lib/userFormat'

// A CV that came back from `/api/cvs/unattached` in the same row shape the
// upload queue produces, so Recent Uploads renders both alike.
function serverCvToRow(cv) {
  return {
    id: `server-cv-${cv.cv_id}`,
    source: 'server',
    filename: cv.file_name,
    sizeBytes: null,
    addedAt: parseServerDate(cv.uploaded_at)?.getTime() ?? null,
    status: 'ready',
    cvId: cv.cv_id,
    candidateId: cv.candidate.id,
    candidateName: cv.candidate.full_name,
    candidateInfo: null,
    linkable: cv.linkable,
    matchedExisting: false,
    application: null,
    match: null,
    error: '',
  }
}

// The dashboard flow: upload → pick a Job → score the batch → read the
// breakdown. The batch is the user's Unattached CVs (from the server after
// a reload, plus this session's uploads), all selected by default.
function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const jobParam = searchParams.get('job')
  const jobId = /^\d+$/.test(jobParam || '') ? Number(jobParam) : null

  // --- the batch -------------------------------------------------------
  const [serverCvs, setServerCvs] = useState([])
  const [serverStatus, setServerStatus] = useState('idle') // idle | loading | ready | error
  const [serverError, setServerError] = useState('')
  // CVs unticked by the user. Tracking exclusions (not inclusions) is what
  // makes "all selected by default" hold for rows that appear later.
  const [excludedCvIds, setExcludedCvIds] = useState(() => new Set())
  // CVs scored this session and the Job they went to. They leave the
  // Unattached list on the server; here they stay visible as "Attached to".
  const [attachedByCvId, setAttachedByCvId] = useState({})

  const loadServerCvs = useCallback(() => {
    setServerStatus('loading')
    setServerError('')
    fetchUnattachedCvs()
      .then((data) => {
        setServerCvs(data)
        setServerStatus('ready')
      })
      .catch((err) => {
        setServerError(err.message)
        setServerStatus('error')
      })
  }, [])

  useEffect(() => {
    loadServerCvs()
  }, [loadServerCvs])

  // --- viewing one CV (Extracted Information) ---------------------------
  const [viewedCvId, setViewedCvId] = useState(null)
  const [profiles, setProfiles] = useState({}) // cvId -> candidate_info (server rows)
  const [profileStatus, setProfileStatus] = useState('idle') // idle | loading | error
  const [profileError, setProfileError] = useState('')

  // A newly-Ready CV is only auto-viewed when nothing is viewed yet - once
  // any selection exists (auto or manual), later completions never override it.
  const handleReady = useCallback((_localId, data) => {
    setViewedCvId((prev) => (prev == null ? data.cv_id : prev))
  }, [])

  const { items, isProcessing, addFiles, retry } = useCvUploadQueue({ onReady: handleReady })

  const rows = useMemo(() => {
    const queueCvIds = new Set(items.map((item) => item.cvId).filter((id) => id != null))
    const serverRows = serverCvs
      .filter((cv) => !queueCvIds.has(cv.cv_id))
      .map(serverCvToRow)
    // Newest activity first: this session's queue, then the server list
    // (already newest first).
    return [...[...items].reverse(), ...serverRows]
  }, [items, serverCvs])

  // The first ready row is auto-viewed after a reload too.
  useEffect(() => {
    if (viewedCvId != null) return
    const first = rows.find((row) => row.status === 'ready' && row.cvId != null)
    if (first) setViewedCvId(first.cvId)
  }, [rows, viewedCvId])

  const viewedRow = rows.find((row) => row.cvId === viewedCvId) || null
  const viewedProfile = viewedRow?.candidateInfo || (viewedCvId != null ? profiles[viewedCvId] : null) || null

  useEffect(() => {
    if (viewedCvId == null || viewedRow?.candidateInfo || profiles[viewedCvId]) {
      setProfileStatus('idle')
      return undefined
    }
    let cancelled = false
    setProfileStatus('loading')
    setProfileError('')
    fetchCv(viewedCvId)
      .then((data) => {
        if (cancelled) return
        setProfiles((prev) => ({ ...prev, [viewedCvId]: data.candidate_info }))
        setProfileStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setProfileError(err.message)
        setProfileStatus('error')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedCvId, viewedRow?.candidateInfo])

  // --- selection --------------------------------------------------------
  const selectableCvIds = useMemo(
    () =>
      rows
        .filter((row) => row.status === 'ready' && row.cvId != null && !attachedByCvId[row.cvId])
        .map((row) => row.cvId),
    [rows, attachedByCvId],
  )
  const selectedCvIds = selectableCvIds.filter((id) => !excludedCvIds.has(id))

  const selection = {
    selectableCount: selectableCvIds.length,
    selectedCount: selectedCvIds.length,
    isSelected: (cvId) => !excludedCvIds.has(cvId),
    onToggle: (cvId) =>
      setExcludedCvIds((prev) => {
        const next = new Set(prev)
        if (next.has(cvId)) next.delete(cvId)
        else next.add(cvId)
        return next
      }),
    onSelectAll: () => setExcludedCvIds(new Set()),
    onSelectNone: () => setExcludedCvIds(new Set(selectableCvIds)),
  }

  // --- the Job ----------------------------------------------------------
  const [job, setJob] = useState(null)
  const [jobStatus, setJobStatus] = useState('idle') // idle | loading | ready | error
  const [jobError, setJobError] = useState('')

  useEffect(() => {
    if (jobId == null) {
      setJob(null)
      setJobStatus('idle')
      return undefined
    }
    let cancelled = false
    setJobStatus('loading')
    setJobError('')
    fetchJob(jobId)
      .then((data) => {
        if (cancelled) return
        setJob(data)
        setJobStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setJobError(err.status === 404 ? `Job ${jobId} no longer exists.` : err.message)
        setJobStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  const chooseJob = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('job', String(id))
    setSearchParams(next, { replace: true })
  }

  const clearJob = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('job')
    setSearchParams(next, { replace: true })
  }

  // --- scoring ----------------------------------------------------------
  const [batch, setBatch] = useState(null) // { jobId, jobTitle, rows }
  const [scoreStatus, setScoreStatus] = useState('idle') // idle | scoring | error | success
  const [scoreError, setScoreError] = useState('')
  const [selectedApplicationId, setSelectedApplicationId] = useState(null)
  const [matchDetail, setMatchDetail] = useState(null)
  const [matchStatus, setMatchStatus] = useState('idle') // idle | loading | error
  const [matchError, setMatchError] = useState('')

  const handleScore = async () => {
    if (!job || selectedCvIds.length === 0 || scoreStatus === 'scoring') return
    setScoreStatus('scoring')
    setScoreError('')
    setSelectedApplicationId(null)
    setMatchDetail(null)
    try {
      const results = await scoreCvsAgainstJob(job.job_id, selectedCvIds)
      setBatch({ jobId: job.job_id, jobTitle: job.title, rows: results })
      setAttachedByCvId((prev) => {
        const next = { ...prev }
        results.forEach((row) => {
          next[row.cv_id] = { jobId: job.job_id, jobTitle: job.title }
        })
        return next
      })
      setJob((prev) =>
        prev
          ? {
              ...prev,
              applications_count:
                prev.applications_count + results.filter((row) => row.status === 'created').length,
            }
          : prev,
      )
      const best = [...results].sort(
        (a, b) => (b.match?.overall_score ?? -1) - (a.match?.overall_score ?? -1),
      )[0]
      setSelectedApplicationId(best ? best.application_id : null)
      setScoreStatus('success')
    } catch (err) {
      setScoreError(err.message)
      setScoreStatus('error')
    }
  }

  // Load the breakdown for the picked Application. A late response for a
  // previously picked row is dropped, so the card never shows a stale one.
  useEffect(() => {
    setMatchDetail(null)
    setMatchError('')
    if (selectedApplicationId == null) {
      setMatchStatus('idle')
      return undefined
    }
    let cancelled = false
    setMatchStatus('loading')
    fetchApplicationMatch(selectedApplicationId)
      .then((data) => {
        if (cancelled) return
        setMatchDetail(data)
        setMatchStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setMatchError(err.message)
        setMatchStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [selectedApplicationId])

  return (
    <main className="dashboard-grid">
      <UploadResume isProcessing={isProcessing} onFilesSelected={addFiles} />
      <RecentUploads
        rows={rows}
        viewedCvId={viewedCvId}
        isProcessing={isProcessing}
        onView={(row) => setViewedCvId(row.cvId)}
        onRetry={retry}
        selection={selection}
        attachedByCvId={attachedByCvId}
        loadStatus={serverStatus}
        loadError={serverError}
        onReload={loadServerCvs}
        emptyHint="Your unattached CVs and this session's uploads show up here."
      />

      <ExtractedInfo
        candidate={viewedProfile}
        loading={profileStatus === 'loading'}
        error={profileStatus === 'error' ? profileError : ''}
      />
      <CandidateMatches
        hasJob={jobStatus === 'ready'}
        batch={batch}
        status={scoreStatus}
        error={scoreError}
        selectedApplicationId={selectedApplicationId}
        onSelectApplication={setSelectedApplicationId}
      />

      <JobDescription
        job={job}
        jobStatus={jobStatus}
        jobError={jobError}
        onJobChosen={chooseJob}
        onClearJob={clearJob}
        selectedCount={selectedCvIds.length}
        scoring={scoreStatus === 'scoring'}
        onScore={handleScore}
      />
      <MatchingFactors
        candidate={matchDetail}
        loading={matchStatus === 'loading'}
        error={matchStatus === 'error' ? matchError : ''}
      />
    </main>
  )
}

export default DashboardPage
