import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JobMatchesPage from './JobMatchesPage'
import { fetchJobMatches } from '../lib/jobsApi'
import { clampPercent } from '../lib/scoreTier'

vi.mock('../lib/jobsApi', () => ({
  fetchJobMatches: vi.fn(),
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

function makeCandidate(overrides = {}) {
  return {
    candidate_id: 1,
    job_id: 9,
    candidate_name: 'Jane Doe',
    job_title: 'Backend Developer',
    status: 'scored',
    overall_score: 67,
    skill_score: 50,
    experience_score: 100,
    education_score: 100,
    matched_skills: [],
    missing_required_skills: [],
    matched_required_skills_count: 1,
    total_required_skills: 2,
    candidate_experience_years: 3,
    required_experience_years: 3,
    candidate_education_level: 'Bachelor',
    required_education_level: 'Bachelor',
    available_criteria: ['skills', 'experience', 'education'],
    effective_weights: { skills: 50, experience: 30, education: 20 },
    explanation: 'Some very long explanation about the match that should never render.',
    rank: 1,
    ...overrides,
  }
}

function makeRanking(overrides = {}) {
  return {
    job_id: 9,
    job_title: 'Senior Data Engineer',
    total_candidates: 3,
    returned_candidates: 3,
    limit: 10,
    offset: 0,
    minimum_score: null,
    candidates: [
      makeCandidate({ candidate_id: 1, candidate_name: 'Jane Doe', overall_score: 67, rank: 1 }),
      makeCandidate({ candidate_id: 2, candidate_name: 'Jane Whitmore', overall_score: 67, rank: 2 }),
      makeCandidate({ candidate_id: 3, candidate_name: 'Melisa Bunjaku', overall_score: 40, rank: 3 }),
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
    await waitFor(() => expect(screen.getByText('Candidate matches')).toBeInTheDocument())
    expect(container.querySelector('main.matches-page-container')).toBeInTheDocument()
  })

  it('displays the real job title and candidate count', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Senior Data Engineer')).toBeInTheDocument())
    expect(screen.getByText('3 candidates ranked')).toBeInTheDocument()
  })

  it('renders candidates in the order returned by the API (by rank)', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const names = screen.getAllByText(/Jane Doe|Jane Whitmore|Melisa Bunjaku/).map((el) => el.textContent)
    expect(names).toEqual(['Jane Doe', 'Jane Whitmore', 'Melisa Bunjaku'])
  })

  it('shows rank, name, and percentage for each candidate', async () => {
    fetchJobMatches.mockResolvedValue(makeRanking())
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const row = screen.getByText('Jane Doe').closest('li')
    expect(within(row).getByText('1')).toBeInTheDocument()
    expect(within(row).getByText('67% match')).toBeInTheDocument()
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
        total_candidates: 1,
        returned_candidates: 1,
        candidates: [makeCandidate({ candidate_id: 1, candidate_name: 'Over Score', overall_score: 150, rank: 1 })],
      }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Over Score')).toBeInTheDocument())
    const bar = screen.getByRole('progressbar')
    expect(bar.firstChild).toHaveStyle({ width: '100%' })
  })

  it('keeps candidates with different IDs but the same name as separate rows', async () => {
    fetchJobMatches.mockResolvedValue(
      makeRanking({
        total_candidates: 2,
        returned_candidates: 2,
        candidates: [
          makeCandidate({ candidate_id: 7, candidate_name: 'Vesa Dakaj', overall_score: 28, rank: 1 }),
          makeCandidate({ candidate_id: 8, candidate_name: 'Vesa Dakaj', overall_score: 28, rank: 2 }),
        ],
      }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getAllByText('Vesa Dakaj')).toHaveLength(2))
    // Distinct DOM rows prove candidate_id (not name) is the React key/identity.
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
        total_candidates: 15,
        returned_candidates: 10,
        offset: 0,
        candidates: Array.from({ length: 10 }, (_, i) =>
          makeCandidate({ candidate_id: i + 1, candidate_name: `Candidate ${i + 1}`, rank: i + 1, overall_score: 50 }),
        ),
      }),
    )
    renderAt(9)
    await waitFor(() => expect(screen.getByText('Candidate 1')).toBeInTheDocument())

    fetchJobMatches.mockResolvedValueOnce(
      makeRanking({
        total_candidates: 15,
        returned_candidates: 5,
        offset: 10,
        candidates: Array.from({ length: 5 }, (_, i) =>
          makeCandidate({ candidate_id: i + 11, candidate_name: `Candidate ${i + 11}`, rank: i + 11, overall_score: 30 }),
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

    expect(screen.getByText('Candidate matches')).toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0)

    resolveFetch(makeRanking())
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })

  it('shows the no-candidates message', async () => {
    fetchJobMatches.mockResolvedValue(
      makeRanking({ total_candidates: 0, returned_candidates: 0, candidates: [] }),
    )
    renderAt(9)
    await waitFor(() =>
      expect(screen.getByText('No candidates are available for this job.')).toBeInTheDocument(),
    )
  })

  it('shows the unscorable-job message', async () => {
    fetchJobMatches.mockResolvedValue(
      makeRanking({
        total_candidates: 2,
        returned_candidates: 2,
        candidates: [
          makeCandidate({ candidate_id: 1, status: 'unscorable', overall_score: null, rank: 1 }),
          makeCandidate({ candidate_id: 2, status: 'unscorable', overall_score: null, rank: 2 }),
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
})
