import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CandidatesPage from './CandidatesPage'
import CandidateDetailPage from './CandidateDetailPage'
import { addCandidateToJob, fetchCandidate, fetchCandidates } from '../lib/candidatesApi'
import { fetchJobs } from '../lib/jobsApi'

vi.mock('../lib/candidatesApi', () => ({
  fetchCandidates: vi.fn(),
  fetchCandidate: vi.fn(),
  addCandidateToJob: vi.fn(),
}))

vi.mock('../lib/jobsApi', () => ({
  fetchJobs: vi.fn(),
}))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/candidates" element={<CandidatesPage />} />
        <Route path="/candidates/:candidateId" element={<CandidateDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function listResponse(candidates, overrides = {}) {
  return { candidates, total: candidates.length, limit: 20, offset: 0, search: null, ...overrides }
}

function candidateRow(overrides = {}) {
  return {
    id: 1,
    full_name: 'Jane Doe',
    email: 'jane@x.com',
    linkable: true,
    cv_count: 2,
    application_count: 1,
    last_uploaded_at: '2026-09-14T08:00:00',
    ...overrides,
  }
}

describe('CandidatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the columns from the endpoint and flags Unattached and Unlinkable people', async () => {
    fetchCandidates.mockResolvedValue(
      listResponse([
        candidateRow(),
        candidateRow({ id: 2, full_name: 'Anon One', email: null, linkable: false, cv_count: 1, application_count: 0 }),
      ]),
    )
    renderAt('/candidates')

    await waitFor(() => expect(screen.getByRole('link', { name: 'Jane Doe' })).toHaveAttribute('href', '/candidates/1'))
    const jane = screen.getByRole('link', { name: 'Jane Doe' }).closest('tr')
    expect(within(jane).getByText('jane@x.com')).toBeInTheDocument()
    expect(within(jane).queryByText('Unattached')).not.toBeInTheDocument()
    expect(within(jane).queryByText('Unlinkable')).not.toBeInTheDocument()

    const anon = screen.getByRole('link', { name: 'Anon One' }).closest('tr')
    expect(within(anon).getByText('No email')).toBeInTheDocument()
    expect(within(anon).getByText('Unlinkable')).toBeInTheDocument()
    expect(within(anon).getByText('Unattached')).toBeInTheDocument()
    expect(fetchCandidates).toHaveBeenCalledWith({ search: '', limit: 20, offset: 0 })
  })

  it('typing in the search box queries the API after a pause and keeps the term in the URL', async () => {
    fetchCandidates.mockResolvedValue(listResponse([candidateRow()]))
    renderAt('/candidates')
    await screen.findByRole('link', { name: 'Jane Doe' })

    fireEvent.change(screen.getByLabelText('Search candidates by name or email'), { target: { value: 'jane' } })

    await waitFor(() => expect(fetchCandidates).toHaveBeenLastCalledWith({ search: 'jane', limit: 20, offset: 0 }), {
      timeout: 2000,
    })
  })

  it('shows the empty states', async () => {
    fetchCandidates.mockResolvedValue(listResponse([]))
    renderAt('/candidates')
    expect(await screen.findByText('No CVs have been uploaded yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload CVs on the dashboard' })).toHaveAttribute('href', '/')

    fetchCandidates.mockResolvedValue(listResponse([], { search: 'zzz' }))
    renderAt('/candidates?search=zzz')
    expect(await screen.findByText('No candidates match your search.')).toBeInTheDocument()
  })
})

describe('CandidateDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchJobs.mockResolvedValue({
      jobs: [{ job_id: 12, title: 'Platform Engineer', company_name: 'Acme', ready_to_match: true, applications_count: 0 }],
    })
  })

  it('shows contact details, CVs, applications with score and job links, and the Add to job dialog', async () => {
    fetchCandidate.mockResolvedValue({
      id: 1,
      full_name: 'Jane Doe',
      email: 'jane@x.com',
      phone: '123',
      location: 'Prishtina',
      linkable: true,
      created_at: '2026-09-14T08:00:00',
      cvs: [
        { cv_id: 72, file_name: 'newest.pdf', uploaded_at: '2026-09-14T08:00:00', uploaded_by: 'Ada Admin' },
        { cv_id: 71, file_name: 'older.pdf', uploaded_at: '2026-09-01T08:00:00', uploaded_by: 'Ada Admin' },
      ],
      applications: [
        { application_id: 501, job_id: 9, job_title: 'Senior Data Engineer', cv_id: 71, status: 'scored', overall_score: 67, created_at: '2026-09-02T08:00:00' },
        { application_id: 502, job_id: 10, job_title: 'Vague Role', cv_id: 72, status: 'unscorable', overall_score: null, created_at: '2026-09-03T08:00:00' },
      ],
    })
    addCandidateToJob.mockResolvedValue({ application_id: 600, status: 'created', candidate_name: 'Jane Doe', match: { status: 'scored', overall_score: 90 } })
    renderAt('/candidates/1')

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument()
    expect(screen.getByText('jane@x.com')).toBeInTheDocument()
    expect(screen.getByText('123')).toBeInTheDocument()
    // Listed under CVs and again as the CV an application was scored from.
    expect(screen.getAllByText(/newest\.pdf/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('(newest)')).toBeInTheDocument()

    const scored = screen.getByRole('link', { name: 'Senior Data Engineer' }).closest('tr')
    expect(screen.getByRole('link', { name: 'Senior Data Engineer' })).toHaveAttribute('href', '/jobs/9')
    expect(within(scored).getByText('67%')).toBeInTheDocument()
    expect(within(scored).getByText('older.pdf')).toBeInTheDocument()
    expect(within(scored).getByRole('link', { name: 'View ranking' })).toHaveAttribute('href', '/jobs/9/matches')
    const unscorable = screen.getByRole('link', { name: 'Vague Role' }).closest('tr')
    expect(within(unscorable).getByText('Unscorable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add to job' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Jane Doe to a job' })
    // CVs and applications came with the page, so the detail is not refetched.
    expect(fetchCandidate).toHaveBeenCalledTimes(1)
    fireEvent.click(await within(dialog).findByRole('radio', { name: /platform engineer/i }))
    expect(within(dialog).getByRole('radio', { name: /newest\.pdf/i })).toBeChecked()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Platform Engineer' }))

    await waitFor(() => expect(addCandidateToJob).toHaveBeenCalledWith(1, { jobId: 12, cvId: 72 }))
    expect(await screen.findByRole('status')).toHaveTextContent('Jane Doe was added to Platform Engineer. Score: 90%.')
    // The page reloads to show the new application.
    await waitFor(() => expect(fetchCandidate).toHaveBeenCalledTimes(2))
  })

  it('marks an unattached, unlinkable candidate', async () => {
    fetchCandidate.mockResolvedValue({
      id: 2,
      full_name: 'Anon One',
      email: null,
      phone: null,
      location: null,
      linkable: false,
      created_at: null,
      cvs: [{ cv_id: 5, file_name: 'anon.pdf', uploaded_at: null, uploaded_by: null }],
      applications: [],
    })
    renderAt('/candidates/2')

    expect(await screen.findByRole('heading', { name: 'Anon One' })).toBeInTheDocument()
    expect(screen.getByText('Unlinkable')).toBeInTheDocument()
    expect(screen.getByText('Unattached')).toBeInTheDocument()
    expect(screen.getByText('No email')).toBeInTheDocument()
    expect(screen.getByText(/Not attached to any job yet/)).toBeInTheDocument()
  })

  it('shows the not-found card', async () => {
    const error = new Error('Candidate 9 not found.')
    error.status = 404
    fetchCandidate.mockRejectedValue(error)
    renderAt('/candidates/9')
    expect(await screen.findByRole('heading', { name: 'Candidate not found' })).toBeInTheDocument()
  })
})
