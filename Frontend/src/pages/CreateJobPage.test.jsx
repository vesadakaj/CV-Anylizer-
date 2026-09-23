import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateJobPage from './CreateJobPage'
import { analyzeJobPreview, createJob } from '../lib/jobsApi'

vi.mock('../lib/jobsApi', () => ({
  analyzeJobPreview: vi.fn(),
  createJob: vi.fn(),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/jobs/new']}>
      <Routes>
        <Route path="/jobs/new" element={<CreateJobPage />} />
        <Route path="/jobs" element={<h1>Jobs list</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

function jobInfo(overrides = {}) {
  return {
    title: 'Backend Developer',
    company_name: 'Acme',
    location: 'Remote',
    department: null,
    employment_type: 'Full-time',
    posting_date: null,
    required_education: "Bachelor's degree",
    required_experience_years: 3,
    experience_description: null,
    skills: [
      { name: 'Python', is_required: true },
      { name: 'Docker', is_required: false },
    ],
    responsibilities: ['Build APIs'],
    required_qualifications: [],
    preferred_qualifications: ['FastAPI'],
    ...overrides,
  }
}

async function reachReviewStep() {
  fireEvent.change(screen.getByLabelText('Paste a job description'), { target: { value: 'A posting.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze job' }))
  await waitFor(() => expect(analyzeJobPreview).toHaveBeenCalledWith('A posting.'))
  await screen.findByText('Review the AI-extracted information before saving.')
}

describe('CreateJobPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    analyzeJobPreview.mockResolvedValue({ job_info: jobInfo(), description: 'A posting.' })
    createJob.mockResolvedValue({ job_id: 5, title: 'Backend Developer' })
  })

  it('keeps the extracted per-skill flag and shows a toggle on every chip', async () => {
    renderPage()
    await reachReviewStep()

    expect(screen.getByRole('button', { name: 'Python: required. Toggle' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Docker: preferred. Toggle' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggling a chip changes the posted payload', async () => {
    renderPage()
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: 'Python: required. Toggle' }))
    expect(screen.getByRole('button', { name: 'Python: preferred. Toggle' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Docker: preferred. Toggle' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save job' }))

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1))
    const payload = createJob.mock.calls[0][0]
    expect(payload.skills).toEqual([
      { name: 'Python', is_required: false },
      { name: 'Docker', is_required: true },
    ])
    expect(payload.title).toBe('Backend Developer')
    expect(payload.required_education).toBe('Bachelor')
    expect(payload.description).toBe('A posting.')
    expect(await screen.findByText('Jobs list')).toBeInTheDocument()
  })

  it('a skill typed in by the reviewer defaults to required', async () => {
    renderPage()
    await reachReviewStep()

    fireEvent.change(screen.getByLabelText('Skills'), { target: { value: 'SQL' } })
    fireEvent.keyDown(screen.getByLabelText('Skills'), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'SQL: required. Toggle' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save job' }))
    await waitFor(() => expect(createJob).toHaveBeenCalled())
    expect(createJob.mock.calls[0][0].skills).toContainEqual({ name: 'SQL', is_required: true })
  })

  it('refuses to save without any skill and never calls the API', async () => {
    analyzeJobPreview.mockResolvedValue({ job_info: jobInfo({ skills: [] }), description: 'A posting.' })
    renderPage()
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: 'Save job' }))

    expect(await screen.findByText('Add at least one skill.')).toBeInTheDocument()
    expect(createJob).not.toHaveBeenCalled()
  })

  it('shows the analyze error and stays on the description step', async () => {
    analyzeJobPreview.mockRejectedValue(new Error('LLM is unavailable'))
    renderPage()

    fireEvent.change(screen.getByLabelText('Paste a job description'), { target: { value: 'A posting.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze job' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('LLM is unavailable')
    expect(screen.queryByRole('button', { name: 'Save job' })).not.toBeInTheDocument()
  })
})
