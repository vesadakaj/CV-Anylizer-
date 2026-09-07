import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'
import { uploadCv } from '../lib/cvApi'
import { analyzeJob, fetchJobs, matchCandidateToJob } from '../lib/jobsApi'

vi.mock('../lib/cvApi', () => ({
  uploadCv: vi.fn(),
}))

vi.mock('../lib/jobsApi', async () => {
  const actual = await vi.importActual('../lib/jobsApi')
  return {
    ...actual,
    fetchJobs: vi.fn(),
    matchCandidateToJob: vi.fn(),
    analyzeJob: vi.fn(),
  }
})

async function analyzeJobViaDashboard(jobId, jobInfo) {
  analyzeJob.mockResolvedValueOnce({ job_id: jobId, job_info: jobInfo })
  const textarea = screen.getByPlaceholderText(/paste the full job posting text here/i)
  fireEvent.change(textarea, { target: { value: 'A full job posting description.' } })
  fireEvent.click(screen.getByRole('button', { name: /analyze job/i }))
  await waitFor(() => expect(analyzeJob).toHaveBeenCalled())
}

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

function candidateResponse(id, name) {
  return {
    candidate_id: id,
    candidate_info: {
      full_name: name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: null,
      location: null,
      work_experience: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
    },
  }
}

function getFileInput() {
  return document.querySelector('input[type="file"]')
}

describe('DashboardPage - sequential CV upload and selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchJobs.mockResolvedValue({ jobs: [], total_candidates: 0 })
  })

  it('adds multiple selected files to Recent Uploads immediately', async () => {
    uploadCv.mockReturnValue(new Promise(() => {})) // never resolves in this test
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.change(getFileInput(), {
      target: { files: [makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')] },
    })

    await waitFor(() => expect(screen.getByText('a.pdf')).toBeInTheDocument())
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
    expect(screen.getByText('c.pdf')).toBeInTheDocument()
  })

  it('disables the file input and drop zone while Processing, re-enables when idle', async () => {
    const first = deferred()
    uploadCv.mockReturnValueOnce(first.promise)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.change(getFileInput(), { target: { files: [makeFile('a.pdf')] } })

    await waitFor(() => expect(getFileInput()).toBeDisabled())
    expect(
      screen.getByText('Please wait until the current CV finishes processing.'),
    ).toBeInTheDocument()

    first.resolve(candidateResponse(1, 'Jane Doe'))
    await waitFor(() => expect(getFileInput()).not.toBeDisabled())
  })

  it('only Ready rows are selectable; Queued/Processing/Failed rows are not', async () => {
    const first = deferred()
    uploadCv.mockReturnValueOnce(first.promise)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.change(getFileInput(), {
      target: { files: [makeFile('a.pdf'), makeFile('b.pdf')] },
    })

    await waitFor(() => expect(screen.getByText('a.pdf')).toBeInTheDocument())
    const bRow = screen.getByText('b.pdf').closest('li')
    const bButton = within(bRow).getByRole('button', { name: /b\.pdf/i })
    expect(bButton).toBeDisabled()

    first.resolve(candidateResponse(1, 'Jane Doe'))
    await waitFor(() => {
      const aRow = screen.getByText('a.pdf').closest('li')
      expect(within(aRow).getByRole('button', { name: /view extracted information/i })).toBeEnabled()
    })
  })

  it('selecting a Ready CV displays its own extracted information, and switching replaces it', async () => {
    const first = deferred()
    const second = deferred()
    uploadCv.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.change(getFileInput(), {
      target: { files: [makeFile('a.pdf'), makeFile('b.pdf')] },
    })

    first.resolve(candidateResponse(1, 'Jane Doe'))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    second.resolve(candidateResponse(2, 'John Smith'))
    await waitFor(() => {
      const bRow = screen.getByText('b.pdf').closest('li')
      expect(within(bRow).getByText('Ready')).toBeInTheDocument()
    })

    // Background completion of b must not have replaced the (implicit) first
    // auto-selection of a - Jane Doe should still be showing.
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument()

    // Now deliberately switch to b.
    const bRow = screen.getByText('b.pdf').closest('li')
    fireEvent.click(within(bRow).getByRole('button', { name: /view extracted information/i }))

    await waitFor(() => expect(screen.getByText('John Smith')).toBeInTheDocument())
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('a later background completion never overwrites a deliberate selection', async () => {
    const first = deferred()
    const second = deferred()
    uploadCv.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.change(getFileInput(), {
      target: { files: [makeFile('a.pdf'), makeFile('b.pdf')] },
    })

    first.resolve(candidateResponse(1, 'Jane Doe'))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    // User deliberately re-selects a (already selected, but exercises the click path).
    const aRow = screen.getByText('a.pdf').closest('li')
    fireEvent.click(within(aRow).getByRole('button', { name: /view extracted information/i }))

    // b finishes in the background - must not replace the deliberately-viewed a.
    second.resolve(candidateResponse(2, 'John Smith'))
    await waitFor(() => {
      const bRow = screen.getByText('b.pdf').closest('li')
      expect(within(bRow).getByText('Ready')).toBeInTheDocument()
    })
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('does not call uploadCv when selecting a Recent Upload (no new candidate is created)', async () => {
    const first = deferred()
    uploadCv.mockReturnValueOnce(first.promise)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.change(getFileInput(), { target: { files: [makeFile('a.pdf')] } })
    first.resolve(candidateResponse(1, 'Jane Doe'))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    expect(uploadCv).toHaveBeenCalledTimes(1)

    const aRow = screen.getByText('a.pdf').closest('li')
    fireEvent.click(within(aRow).getByRole('button', { name: /view extracted information/i }))

    expect(uploadCv).toHaveBeenCalledTimes(1)
  })

  it('invalid files do not block the valid queued files', async () => {
    uploadCv.mockResolvedValue(candidateResponse(1, 'Jane Doe'))
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    const badFile = new File(['x'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(getFileInput(), { target: { files: [badFile, makeFile('a.pdf')] } })

    await waitFor(() => expect(screen.getByText('a.pdf')).toBeInTheDocument())
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
    expect(screen.getByText(/notes\.txt/)).toBeInTheDocument() // surfaced in the rejection message
  })
})

describe('DashboardPage - matching the selected candidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchJobs.mockResolvedValue({ jobs: [], total_candidates: 0 })
  })

  it('shows the "select a CV" prompt when no candidate is selected', async () => {
    uploadCv.mockReturnValue(new Promise(() => {}))
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('Select a completed CV before matching it to a job.'),
    ).toBeInTheDocument()
    expect(matchCandidateToJob).not.toHaveBeenCalled()
  })

  it('matches selected candidate_id + job_id, clears stale results on switch, and never lets a late-resolving result for the old candidate appear', async () => {
    const first = deferred()
    const second = deferred()
    uploadCv.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const matchA = deferred()
    matchCandidateToJob.mockImplementation((candidateId, jobId) => {
      if (candidateId === 1) return matchA.promise
      return Promise.resolve({
        candidate_id: candidateId,
        job_id: jobId,
        candidate_name: 'John Smith',
        job_title: 'Backend Developer',
        status: 'scored',
        overall_score: 55,
        available_criteria: ['skills'],
      })
    })

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    fireEvent.change(getFileInput(), {
      target: { files: [makeFile('a.pdf'), makeFile('b.pdf')] },
    })
    first.resolve(candidateResponse(1, 'Jane Doe'))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    await analyzeJobViaDashboard(42, {
      title: 'Backend Developer',
      company_name: 'Acme',
      required_experience_years: 3,
      required_education: null,
      skills: [],
    })

    await waitFor(() => expect(matchCandidateToJob).toHaveBeenCalledWith(1, 42))
    expect(screen.getByText('Matching…')).toBeInTheDocument() // matchA still pending

    second.resolve(candidateResponse(2, 'John Smith'))
    await waitFor(() => {
      const bRow = screen.getByText('b.pdf').closest('li')
      expect(within(bRow).getByText('Ready')).toBeInTheDocument()
    })

    // Deliberately switch selection to b - must clear the pending/old result
    // immediately and issue a fresh match for the new candidate.
    const bRow = screen.getByText('b.pdf').closest('li')
    fireEvent.click(within(bRow).getByRole('button', { name: /view extracted information/i }))

    await waitFor(() => expect(matchCandidateToJob).toHaveBeenCalledWith(2, 42))
    await waitFor(() => expect(screen.getByText('55% match')).toBeInTheDocument())

    // Candidate A's request resolves late - its result must never appear
    // while candidate B is the one selected.
    matchA.resolve({
      candidate_id: 1,
      job_id: 42,
      candidate_name: 'Jane Doe',
      job_title: 'Backend Developer',
      status: 'scored',
      overall_score: 99,
      available_criteria: ['skills'],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('99% match')).not.toBeInTheDocument()
    expect(screen.getByText('55% match')).toBeInTheDocument()
  })
})
