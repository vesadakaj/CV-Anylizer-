import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JobDetailPage from './JobDetailPage'
import { fetchUnattachedCvs, uploadCv } from '../lib/cvApi'
import { fetchJob } from '../lib/jobsApi'

vi.mock('../lib/cvApi', () => ({
  uploadCv: vi.fn(),
  fetchUnattachedCvs: vi.fn(),
  fetchCv: vi.fn(),
}))

vi.mock('../lib/jobsApi', () => ({
  fetchJob: vi.fn(),
}))

function renderAt(jobId) {
  return render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}`]}>
      <Routes>
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function jobDetail(overrides = {}) {
  return {
    job_id: 7,
    title: 'Backend Developer',
    company_name: 'Acme',
    location: null,
    department: null,
    employment_type: null,
    description: null,
    required_education: null,
    required_experience_years: 3,
    experience_description: null,
    posting_date: null,
    responsibilities: [],
    required_qualifications: [],
    preferred_qualifications: [],
    skills: [{ name: 'Python', is_required: true }, { name: 'Docker', is_required: false }],
    required_skills: ['Python'],
    preferred_skills: ['Docker'],
    required_skills_count: 1,
    applications_count: 2,
    ready_to_match: true,
    created_by: 'Ada Admin',
    created_at: '2026-09-14T08:00:00',
    ...overrides,
  }
}

function makeFile(name) {
  return new File(['dummy content'], name, { type: 'application/pdf' })
}

describe('JobDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchJob.mockResolvedValue(jobDetail())
  })

  it('shows the creator, the applications count, a link to the matches and the preferred skills apart', async () => {
    renderAt(7)

    expect(await screen.findByRole('heading', { name: 'Backend Developer' })).toBeInTheDocument()
    expect(screen.getByText(/Created by Ada Admin/)).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View all applications' })).toHaveAttribute('href', '/jobs/7/matches')
    expect(screen.getByText('Docker')).toHaveClass('chip-muted')
    expect(screen.getByText('Python')).not.toHaveClass('chip-muted')
    expect(screen.getByText(/never count toward the candidate match score/)).toBeInTheDocument()
  })

  it('uploads with the job id, shows the score inline and bumps the count; the CV is never Unattached', async () => {
    uploadCv.mockResolvedValue({
      cv_id: 31,
      candidate_id: 3,
      candidate_matched_existing: false,
      linkable: true,
      application: { id: 900, status: 'created' },
      match: { status: 'scored', overall_score: 72 },
      candidate_info: { full_name: 'Jane Doe', skills: [], languages: [], education: [], work_experience: [], projects: [] },
    })
    renderAt(7)
    await screen.findByRole('heading', { name: 'Backend Developer' })

    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [makeFile('jane.pdf')] } })

    await waitFor(() => expect(uploadCv).toHaveBeenCalledWith(expect.any(File), { jobId: 7 }))
    const row = await screen.findByText('jane.pdf')
    await waitFor(() => expect(within(row.closest('li')).getByText('72%')).toBeInTheDocument())
    expect(within(row.closest('li')).getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument()
    // Nothing on this page ever touches the Unattached list.
    expect(fetchUnattachedCvs).not.toHaveBeenCalled()
  })

  it('an upload that replaced an existing application reads "Updated existing" and does not bump the count', async () => {
    uploadCv.mockResolvedValue({
      cv_id: 32,
      candidate_id: 3,
      candidate_matched_existing: true,
      linkable: true,
      application: { id: 900, status: 'updated' },
      match: { status: 'scored', overall_score: 88 },
      candidate_info: { full_name: 'Jane Doe', skills: [], languages: [], education: [], work_experience: [], projects: [] },
    })
    renderAt(7)
    await screen.findByRole('heading', { name: 'Backend Developer' })

    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [makeFile('jane-v2.pdf')] } })

    const row = await screen.findByText('jane-v2.pdf')
    await waitFor(() => expect(within(row.closest('li')).getByText('Updated existing')).toBeInTheDocument())
    expect(within(row.closest('li')).getByText('Existing candidate')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument()
  })

  it('an unscorable job still accepts uploads and says so', async () => {
    fetchJob.mockResolvedValue(jobDetail({ ready_to_match: false, required_skills: [], required_experience_years: null, skills: [] }))
    uploadCv.mockResolvedValue({
      cv_id: 33,
      candidate_id: 4,
      linkable: true,
      application: { id: 901, status: 'created' },
      match: { status: 'unscorable', overall_score: null },
      candidate_info: { full_name: 'Anon', skills: [], languages: [], education: [], work_experience: [], projects: [] },
    })
    renderAt(7)
    await screen.findByRole('heading', { name: 'Backend Developer' })
    expect(screen.getByText(/cannot be scored until it has a usable requirement/)).toBeInTheDocument()

    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [makeFile('anon.pdf')] } })

    const row = await screen.findByText('anon.pdf')
    await waitFor(() => expect(within(row.closest('li')).getByText('Unscorable')).toBeInTheDocument())
  })

  it('shows the not-found card for a missing job', async () => {
    const error = new Error('Job 99 not found.')
    error.status = 404
    fetchJob.mockRejectedValue(error)
    renderAt(99)
    expect(await screen.findByRole('heading', { name: 'Job not found' })).toBeInTheDocument()
  })
})
