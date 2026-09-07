import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCvUploadQueue } from './useCvUploadQueue'
import { uploadCv } from './cvApi'

vi.mock('./cvApi', () => ({
  uploadCv: vi.fn(),
}))

function makeFile(name) {
  return new File(['dummy content'], name, { type: 'application/pdf' })
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useCvUploadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadCv.mockResolvedValue({ candidate_id: 0, candidate_info: {} })
  })

  it('adds multiple valid files to the queue immediately, in selection order', () => {
    const { result } = renderHook(() => useCvUploadQueue())

    act(() => {
      result.current.addFiles([makeFile('a.pdf'), makeFile('b.docx')])
    })

    expect(result.current.items.map((item) => item.filename)).toEqual(['a.pdf', 'b.docx'])
  })

  it('rejects invalid file types without blocking the valid ones', () => {
    const { result } = renderHook(() => useCvUploadQueue())

    let outcome
    act(() => {
      outcome = result.current.addFiles([makeFile('a.pdf'), makeFile('bad.txt'), makeFile('b.docx')])
    })

    expect(outcome.added).toBe(2)
    expect(outcome.rejectedNames).toEqual(['bad.txt'])
    expect(result.current.items.map((item) => item.filename)).toEqual(['a.pdf', 'b.docx'])
  })

  it('processes exactly one file at a time; later files stay Queued', async () => {
    const first = deferred()
    uploadCv.mockReturnValueOnce(first.promise)

    const { result } = renderHook(() => useCvUploadQueue())
    act(() => {
      result.current.addFiles([makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')])
    })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1))
    expect(result.current.isProcessing).toBe(true)
    expect(result.current.items.map((item) => item.status)).toEqual([
      'processing',
      'queued',
      'queued',
    ])

    await act(async () => {
      first.resolve({ candidate_id: 1, candidate_info: { full_name: 'A' } })
    })

    await waitFor(() => expect(result.current.items[0].status).toBe('ready'))
    expect(result.current.items[0].candidateId).toBe(1)
  })

  it('starts the second upload only after the first becomes Ready', async () => {
    const first = deferred()
    const second = deferred()
    uploadCv.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = renderHook(() => useCvUploadQueue())
    act(() => {
      result.current.addFiles([makeFile('a.pdf'), makeFile('b.pdf')])
    })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1))
    expect(result.current.items[1].status).toBe('queued')

    await act(async () => {
      first.resolve({ candidate_id: 1, candidate_info: {} })
    })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(2))
    expect(result.current.items[1].status).toBe('processing')
  })

  it('a failed first upload starts the next queued file (queue is not blocked)', async () => {
    const first = deferred()
    const second = deferred()
    uploadCv.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = renderHook(() => useCvUploadQueue())
    act(() => {
      result.current.addFiles([makeFile('a.pdf'), makeFile('b.pdf')])
    })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1))

    await act(async () => {
      first.reject(new Error('Extraction failed.'))
    })

    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))
    expect(result.current.items[0].error).toBe('Extraction failed.')

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(2))
    expect(result.current.items[1].status).toBe('processing')
  })

  it('never has more than one active request at any moment', async () => {
    const first = deferred()
    const second = deferred()
    const third = deferred()
    uploadCv
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)

    const { result } = renderHook(() => useCvUploadQueue())
    act(() => {
      result.current.addFiles([makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')])
    })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1))
    expect(result.current.items.filter((item) => item.status === 'processing')).toHaveLength(1)

    await act(async () => {
      first.resolve({ candidate_id: 1, candidate_info: {} })
    })
    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(2))
    expect(result.current.items.filter((item) => item.status === 'processing')).toHaveLength(1)

    await act(async () => {
      second.resolve({ candidate_id: 2, candidate_info: {} })
    })
    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(3))
    expect(result.current.items.filter((item) => item.status === 'processing')).toHaveLength(1)

    await act(async () => {
      third.resolve({ candidate_id: 3, candidate_info: {} })
    })
    await waitFor(() => expect(result.current.items[2].status).toBe('ready'))
  })

  it('blocks retry while another file is processing, then requeues at the end once idle', async () => {
    const a = deferred()
    const b = deferred()
    const c = deferred()
    uploadCv.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise)

    const { result } = renderHook(() => useCvUploadQueue())
    act(() => {
      result.current.addFiles([makeFile('a.pdf'), makeFile('b.pdf')])
    })
    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1))

    await act(async () => {
      a.reject(new Error('boom'))
    })
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))
    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(2)) // b now processing

    const failedId = result.current.items[0].id

    // b is still processing - retry must be a no-op, even clicked repeatedly.
    act(() => {
      result.current.retry(failedId)
      result.current.retry(failedId)
    })
    expect(result.current.items.find((item) => item.id === failedId).status).toBe('failed')
    expect(uploadCv).toHaveBeenCalledTimes(2)

    await act(async () => {
      b.resolve({ candidate_id: 2, candidate_info: {} })
    })
    await waitFor(() => expect(result.current.isProcessing).toBe(false))

    // Now idle: retry requeues the failed item at the end of the list and it
    // starts immediately since nothing else is active.
    act(() => {
      result.current.retry(failedId)
    })
    expect(result.current.items[result.current.items.length - 1].id).toBe(failedId)
    expect(result.current.items[result.current.items.length - 1].status).toBe('processing')

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(3))

    await act(async () => {
      c.resolve({ candidate_id: 1, candidate_info: {} })
    })
    await waitFor(() =>
      expect(result.current.items.find((item) => item.id === failedId).status).toBe('ready'),
    )
  })

  it('does not create duplicate requests from repeated retry clicks while idle', async () => {
    const first = deferred()
    uploadCv.mockReturnValueOnce(first.promise)

    const { result } = renderHook(() => useCvUploadQueue())
    act(() => {
      result.current.addFiles([makeFile('a.pdf')])
    })
    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1))

    await act(async () => {
      first.reject(new Error('boom'))
    })
    await waitFor(() => expect(result.current.items[0].status).toBe('failed'))

    const id = result.current.items[0].id
    act(() => {
      result.current.retry(id)
      result.current.retry(id) // second click in the same batch must be a no-op
    })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(2))
    // Only one retry actually re-queued the item - no duplicate in-flight request.
    expect(result.current.items.filter((item) => item.id === id)).toHaveLength(1)
    expect(uploadCv).toHaveBeenCalledTimes(2)
  })
})
