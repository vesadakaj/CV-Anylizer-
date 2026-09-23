import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadCv } from './cvApi'

const ALLOWED_EXTENSIONS = ['.pdf', '.docx']

function getExtension(name) {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx).toLowerCase()
}

let idCounter = 0
function nextLocalId() {
  idCounter += 1
  return `cv-${idCounter}`
}

/**
 * Drives a strictly sequential CV upload queue: exactly one item is ever
 * "processing" at a time, and /api/cv/upload is never called concurrently.
 * The dashboard (no Job) and the Job page (with `jobId`) share this hook;
 * the only difference is whether each upload is attached to a Job.
 *
 * Each item: { id, file, filename, sizeBytes, addedAt, status, cvId,
 * candidateId, candidateInfo, linkable, matchedExisting, application,
 * match, error }, where status is 'queued' | 'processing' | 'ready' |
 * 'failed'. `id` (a local, stable id) is the identity to use as a React
 * key for the item's whole lifetime; `cvId` (only set once status is
 * 'ready') is the persisted CV's identity for selection and scoring.
 * `application` is `{ id, status: 'created' | 'updated' }` when the upload
 * was attached to a Job, and `match` its stored Match Result.
 */
export function useCvUploadQueue({ onReady, jobId = null } = {}) {
  const [items, setItems] = useState([])
  // Guards against React StrictMode's deliberate double-invocation of
  // effects in development, which would otherwise fire uploadCv() twice for
  // the same queued item before the first call's state update commits.
  const dispatchedRef = useRef(new Set())
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const jobIdRef = useRef(jobId)
  jobIdRef.current = jobId
  // Flipped false on unmount so an in-flight upload's resolution never calls
  // setState (and never reports onReady) after the component is gone.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isProcessing = items.some((item) => item.status === 'processing')

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  useEffect(() => {
    if (items.some((item) => item.status === 'processing')) return
    const next = items.find((item) => item.status === 'queued')
    if (!next) return
    if (dispatchedRef.current.has(next.id)) return
    dispatchedRef.current.add(next.id)

    updateItem(next.id, { status: 'processing' })

    uploadCv(next.file, { jobId: jobIdRef.current })
      .then((data) => {
        if (!mountedRef.current) return
        updateItem(next.id, {
          status: 'ready',
          cvId: data.cv_id ?? null,
          candidateId: data.candidate_id,
          candidateInfo: data.candidate_info,
          linkable: data.linkable !== false,
          matchedExisting: Boolean(data.candidate_matched_existing),
          application: data.application || null,
          match: data.match || null,
          error: '',
        })
        onReadyRef.current?.(next.id, data)
      })
      .catch((err) => {
        if (!mountedRef.current) return
        updateItem(next.id, { status: 'failed', error: err.message })
      })
      .finally(() => {
        dispatchedRef.current.delete(next.id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, updateItem])

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || [])
    const added = []
    const rejectedNames = []

    for (const file of files) {
      if (!ALLOWED_EXTENSIONS.includes(getExtension(file.name))) {
        rejectedNames.push(file.name)
        continue
      }
      added.push({
        id: nextLocalId(),
        file,
        filename: file.name,
        sizeBytes: file.size,
        addedAt: Date.now(),
        status: 'queued',
        cvId: null,
        candidateId: null,
        candidateInfo: null,
        linkable: true,
        matchedExisting: false,
        application: null,
        match: null,
        error: '',
      })
    }

    if (added.length > 0) {
      setItems((prev) => [...prev, ...added])
    }

    return { added: added.length, rejectedNames }
  }, [])

  // Failed items go to the back of the queue on retry, and only when
  // nothing else is currently processing - repeated clicks are inert once
  // the item is no longer 'failed'.
  const retry = useCallback((id) => {
    setItems((prev) => {
      if (prev.some((item) => item.status === 'processing')) return prev
      const target = prev.find((item) => item.id === id)
      if (!target || target.status !== 'failed') return prev
      const rest = prev.filter((item) => item.id !== id)
      return [...rest, { ...target, status: 'queued', error: '' }]
    })
  }, [])

  return { items, isProcessing, addFiles, retry }
}
