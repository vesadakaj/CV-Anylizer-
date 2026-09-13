import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JobMatchesPage from './JobMatchesPage'
import { addCandidateToJob, fetchCandidate } from '../lib/candidatesApi'
import { fetchJobMatches, fetchJobs } from '../lib/jobsApi'
import { clampPercent } from '../lib/scoreTier'

vi.mock('../lib/jobsApi', () => ({
  fetchJobMatches: vi.fn(),
  fetchJobs: vi.fn(),
}))

vi.mock('../lib/candidatesApi', () => ({
  fetchCandidate: vi.fn(),
  addCandidateToJob: vi.fn(),
}))

function renderAt(jobId) {
  return render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}/matches`]}>
      <Routes>
        <Route path="/jobs/:jobId/matches" element={<JobMatchesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// One row of GET /api/jobs/{id}/matches: summary only. The extra fields
// below never come from the API; they are here to prove the page would not
// render them even if they did.
function makeApplication(overrides = {}) {
  return {
    rank: 1,
    application_id: 501,
    candidate_id: 1,
    cv_id: 71,
    candidate_name: 'Jane Doe',
    status: 'scored',
    overall_score: 67,
    skill_score: 50,
    matched_skills: ['Python'],
    missing_required_skills: ['SQL'],
    explanation: 'Some very long explanation about the match that should never render.',
    ...overrides,
  }
}

function makeRanking(overrides = {}) {
  return {
    job_id: 9,
    job_title: 'Senior Data Engineer',
    total_applications: 3,
    returned_applications: 3,
    limit: 10,
    offset: 0,
    minimum_score: null,
    applications: [
      makeApplication({ application_id: 501, candidate_id: 1, candidate_name: 'Jane Doe', overall_score: 67, rank: 1 }),
      makeApplication({ application_id: 502, candidate_id: 2, candidate_name: 'Jane Whitmore', overall_score: 67, rank: 2 }),
      makeApplication({ application_id: 503, candidate_id: 3, candidate_name: 'Melisa Bunjaku', overall_score: 40, rank: 3 }),
    ],
    ...overrides,
  }
}

describe('JobMatchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the wide layout container', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    const { container } = renderAt(9)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Applications' })).toBeInTheDocument())
    expect(container.querySelector('main.matches-page-container')).toBeInTheDocument()
  })

  it('displays the real job title and application count', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Senior Data Engineer')).toBeInTheDocument())
    expect(screen.getByText('3 applications ranked')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute('href', '/jobs/9')
  })

  it('renders only what the endpoint returns, in rank order', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const names = screen.getAllByText(/Jane Doe|Jane Whitmore|Melisa Bunjaku/).map((el) => el.textContent)
    expect(names).toEqual(['Jane Doe', 'Jane Whitmore', 'Melisa Bunjaku'])
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows rank, name (linking to the candidate) and percentage for each application', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const row = screen.getByText('Jane Doe').closest('li')
    expect(within(row).getByText('1')).toBeInTheDocument()
    expect(within(row).getByText('67% match')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Jane Doe' })).toHaveAttribute('href', '/candidates/1')
  })

  it('sets progress bar width to reflect the percentage', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const bar = screen.getByRole('progressbar', { name: /Jane Doe: 67% match/i })
    expect(bar).toHaveAttribute('aria-valuenow', '67')
    expect(bar.firstChild).toHaveStyle({ width: '67%' })
  })

  it('clamps out-of-range scores to a safe 0-100 visual width', async () => {
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(-30)).toBe(0)
    expect(clampPercent(null)).toBe(0)
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(clampPercent(42)).toBe(42)

    fetchJobMatches.mockResolvedValue(
      makeRanking({
        total_applications: 1,
        returned_applications: 1,
        applications: [makeApplication({ candidate_name: 'Over Score', overall_score: 150 })],
      }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Over Score')).toBeInTheDocument())
    const bar = screen.getByRole('progressbar')
    expect(bar.firstChild).toHaveStyle({ width: '100%' })
  })

  it('keeps applications of different ids but the same name as separate rows', async () => {
    fetchJobMatches.mockResolvedValue(
      makeRanking({
        total_applications: 2,
        returned_applications: 2,
        applications: [
          makeApplication({ application_id: 7, candidate_id: 7, candidate_name: 'Vesa Dakaj', overall_score: 28, rank: 1 }),
          makeApplication({ application_id: 8, candidate_id: 8, candidate_name: 'Vesa Dakaj', overall_score: 28, rank: 2 }),
        ],
      }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getAllByText('Vesa Dakaj')).toHaveLength(2))
    const rows = screen.getAllByText('Vesa Dakaj').map((el) => el.closest('li'))
    expect(rows[0]).not.toBe(rows[1])
  })

  it('never renders comparison, component-score, or explanation content', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    expect(screen.queryByText(/view full comparison/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/view comparison/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/skill score/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/experience score/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/education score/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/matched skills/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/missing.*skills/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/very long explanation/i)).not.toBeInTheDocument()
  })

  it('preserves global rank numbers across pages', async () => {
    fetchJobMatches.mockResolvedValueOnce(
      makeRanking({
        total_applications: 15,
        returned_applications: 10,
        offset: 0,
        applications: Array.from({ length: 10 }, (_, i) =>
          makeApplication({ application_id: i + 1, candidate_id: i + 1, candidate_name: `Candidate ${i + 1}`, rank: i + 1, overall_score: 50 }),
        ),
      }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Candidate 1')).toBeInTheDocument())

    fetchJobMatches.mockResolvedValueOnce(
      makeRanking({
        total_applications: 15,
        returned_applications: 5,
        offset: 10,
        applications: Array.from({ length: 5 }, (_, i) =>
          makeApplication({ application_id: i + 11, candidate_id: i + 11, candidate_name: `Candidate ${i + 11}`, rank: i + 11, overall_score: 30 }),
        ),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getByText('Candidate 11')).toBeInTheDocument())
    const row = screen.getByText('Candidate 11').closest('li')
    expect(within(row).getByText('11')).toBeInTheDocument()
    expect(fetchJobMatches).toHaveBeenLastCalledWith(9, { limit: 10, offset: 10 })
  })

  it('shows row skeletons while loading', async () => {
    let resolveFetch
    fetchJobMatches.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const { container } = renderAt(9)

    expect(screen.getByRole('heading', { name: 'Applications' })).toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0)

    resolveFetch(makeRanking())
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })

  it('the empty state explains the two ways to add candidates', async () => {
    fetchJobMatches.mockResolvedValue(
      makeRanking({ total_applications: 0, returned_applications: 0, applications: [] }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getByText('No one has applied to this job yet.')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'job page' })).toHaveAttribute('href', '/jobs/9')
    expect(screen.getByRole('link', { name: 'dashboard' })).toHaveAttribute('href', '/?job=9')
    expect(screen.getByRole('link', { name: 'Candidates' })).toHaveAttribute('href', '/candidates')
  })

  it('shows the unscorable-job message', async () => {
    fetchJobMatches.mockResolvedValue(
      makeRanking({
        total_applications: 2,
        returned_applications: 2,
        applications: [
          makeApplication({ application_id: 1, status: 'unscorable', overall_score: null, rank: 1 }),
          makeApplication({ application_id: 2, status: 'unscorable', overall_score: null, rank: 2 }),
        ],
      }),
    )
    renderAt(9)
    await waitFor(() =>
      expect(
        screen.getByText('This job does not have enough structured requirements for matching.'),
      ).toBeInTheDocument(),
    )
  })

  it('shows the job-not-found message with a back link', async () => {
    const error = new Error('Job 999 not found.')
    error.status = 404
    fetchJobMatches.mockRejectedValue(error)
    renderAt(999)
    await waitFor(() => expect(screen.getByText('Job not found.')).toBeInTheDocument())
    expect(screen.getAllByRole('link', { name: /back to jobs/i }).length).toBeGreaterThanOrEqual(2)
  })

  it('shows a user-friendly error with retry, without exposing raw backend errors', async () => {
    fetchJobMatches.mockRejectedValue(new Error('Could not load candidate matches.'))
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Could not load candidate matches.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  describe('Add to another job', () => {
    beforeEach(() => {
      fetchJobMatches.mockResolvedValue(makeRanking())
      fetchJobs.mockResolvedValue({
        jobs: [
          { job_id: 9, title: 'Senior Data Engineer', company_name: 'Acme', ready_to_match: true, applications_count: 3 },
          { job_id: 12, title: 'Platform Engineer', company_name: 'Acme', ready_to_match: true, applications_count: 0 },
          { job_id: 13, title: 'Vague Role', company_name: 'Acme', ready_to_match: false, applications_count: 0 },
        ],
      })
    })

    it('posts the right body with the newest CV preselected and shows a toast', async () => {
      fetchCandidate.mockResolvedValue({
        id: 1,
        full_name: 'Jane Doe',
        cvs: [{ cv_id: 71, file_name: 'jane.pdf', uploaded_at: '2026-09-14T08:00:00' }],
        applications: [{ application_id: 501, job_id: 9 }],
      })
      addCandidateToJob.mockResolvedValue({
        application_id: 900,
        status: 'created',
        candidate_name: 'Jane Doe',
        match: { status: 'scored', overall_score: 80 },
      })
      renderAt(9)
      await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

      const row = screen.getByText('Jane Doe').closest('li')
      fireEvent.click(within(row).getByRole('button', { name: 'Add to another job' }))

      const dialog = await screen.findByRole('dialog', { name: 'Add Jane Doe to a job' })
      await waitFor(() => expect(fetchCandidate).toHaveBeenCalledWith(1))
      // The current Job is excluded; a Job that is not ready cannot be chosen.
      await waitFor(() => expect(within(dialog).getByText('Platform Engineer')).toBeInTheDocument())
      expect(within(dialog).queryByText('Senior Data Engineer')).not.toBeInTheDocument()
      expect(within(dialog).getByRole('radio', { name: /vague role/i })).toBeDisabled()
      // One CV: no CV picker.
      expect(within(dialog).queryByText('Score from which CV?')).not.toBeInTheDocument()

      fireEvent.click(within(dialog).getByRole('radio', { name: /platform engineer/i }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Platform Engineer' }))

      await waitFor(() => expect(addCandidateToJob).toHaveBeenCalledWith(1, { jobId: 12, cvId: 71 }))
      expect(await screen.findByRole('status')).toHaveTextContent('Jane Doe was added to Platform Engineer. Score: 80%.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('offers a CV picker when the candidate has more than one CV and words an update', async () => {
      fetchCandidate.mockResolvedValue({
        id: 1,
        full_name: 'Jane Doe',
        cvs: [
          { cv_id: 72, file_name: 'newest.pdf', uploaded_at: '2026-09-14T08:00:00' },
          { cv_id: 71, file_name: 'older.pdf', uploaded_at: '2026-09-01T08:00:00' },
        ],
        applications: [{ application_id: 501, job_id: 9 }, { application_id: 502, job_id: 12 }],
      })
      addCandidateToJob.mockResolvedValue({
        application_id: 502,
        status: 'updated',
        candidate_name: 'Jane Doe',
        match: { status: 'scored', overall_score: 61 },
      })
      renderAt(9)
      await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
      fireEvent.click(within(screen.getByText('Jane Doe').closest('li')).getByRole('button', { name: 'Add to another job' }))

      const dialog = await screen.findByRole('dialog')
      await waitFor(() => expect(within(dialog).getByText('Score from which CV?')).toBeInTheDocument())
      expect(within(dialog).getByRole('radio', { name: /newest\.pdf/i })).toBeChecked()
      expect(within(dialog).getByText('Already applied')).toBeInTheDocument()

      fireEvent.click(within(dialog).getByRole('radio', { name: /older\.pdf/i }))
      fireEvent.click(within(dialog).getByRole('radio', { name: /platform engineer/i }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Platform Engineer' }))

      await waitFor(() => expect(addCandidateToJob).toHaveBeenCalledWith(1, { jobId: 12, cvId: 71 }))
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Jane Doe was already in Platform Engineer; the application now uses the chosen CV and was rescored. Score: 61%.',
      )
    })

    it('shows the API error inside the dialog and keeps it open', async () => {
      fetchCandidate.mockResolvedValue({ id: 1, full_name: 'Jane Doe', cvs: [{ cv_id: 71, file_name: 'jane.pdf' }], applications: [] })
      addCandidateToJob.mockRejectedValue(new Error('Could not save the application.'))
      renderAt(9)
      await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
      fireEvent.click(within(screen.getByText('Jane Doe').closest('li')).getByRole('button', { name: 'Add to another job' }))

      const dialog = await screen.findByRole('dialog')
      fireEvent.click(await within(dialog).findByRole('radio', { name: /platform engineer/i }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Platform Engineer' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not save the application.')
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
