import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ComparePage from './ComparePage'
import { fetchComparison } from '../lib/comparisonApi'
import { fetchJobMatches, fetchJobs } from '../lib/jobsApi'

vi.mock('../lib/comparisonApi', () => ({
  fetchComparison: vi.fn(),
}))

vi.mock('../lib/jobsApi', () => ({
  fetchJobs: vi.fn(),
  fetchJobMatches: vi.fn(),
}))

function renderAt(search) {
  return render(
    <MemoryRouter initialEntries={[`/compare${search}`]}>
      <Routes>
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function makeSide(overrides = {}) {
  return {
    cv_id: 71,
    candidate_id: 1,
    candidate_name: 'Ada Lovelace',
    email: 'ada@example.com',
    file_name: 'ada.pdf',
    uploaded_at: '2026-09-01T08:00:00',
    application_id: 501,
    status: 'scored',
    overall_score: 77.5,
    skill_score: 75,
    experience_score: 100,
    education_score: 50,
    matched_required_skills: ['Airflow', 'Python', 'SQL'],
    missing_required_skills: ['Spark'],
    matched_required_skills_count: 3,
    total_required_skills: 4,
    preferred_skills_matched: ['Kubernetes'],
    total_preferred_skills: 2,
    experience_years: 8,
    education_level: 'Bachelor',
    field_of_study: 'Computer Science',
    latest_position: 'Engineer at Acme',
    skills_count: 5,
    languages: [],
    explanation: 'Skills (50.00% weight): 3/4 required skills matched.',
    ...overrides,
  }
}

function makeComparison(overrides = {}) {
  return {
    mode: 'job',
    job_id: 9,
    job_title: 'Senior Data Engineer',
    ready_to_match: true,
    algorithm_version: 1,
    a: makeSide(),
    b: makeSide({
      cv_id: 72,
      candidate_id: 2,
      candidate_name: 'Grace Hopper',
      file_name: 'grace.pdf',
      application_id: 502,
      overall_score: 47.5,
      skill_score: 25,
      experience_score: 50,
      education_score: 100,
      matched_required_skills: ['Python'],
      missing_required_skills: ['Airflow', 'SQL', 'Spark'],
      matched_required_skills_count: 1,
      preferred_skills_matched: [],
      experience_years: 2,
      education_level: 'PhD',
      field_of_study: 'Mathematics',
      skills_count: 2,
    }),
    winner: 'a',
    score_delta: 30,
    margin: 'decisive',
    criteria: [
      {
        criterion: 'skills',
        label: 'Skills',
        weight: 50,
        a_score: 75,
        b_score: 25,
        a_detail: '3 of 4 required skills',
        b_detail: '1 of 4 required skills',
        score_delta: 50,
        contribution_delta: 25,
        winner: 'a',
      },
      {
        criterion: 'experience',
        label: 'Experience',
        weight: 30,
        a_score: 100,
        b_score: 50,
        a_detail: '8.0 of 4.0 years',
        b_detail: '2.0 of 4.0 years',
        score_delta: 50,
        contribution_delta: 15,
        winner: 'a',
      },
      {
        criterion: 'education',
        label: 'Education',
        weight: 20,
        a_score: 50,
        b_score: 100,
        a_detail: 'Bachelor',
        b_detail: 'PhD',
        score_delta: -50,
        contribution_delta: -10,
        winner: 'b',
      },
    ],
    skill_groups: [
      {
        kind: 'required',
        label: 'Required skills',
        both: ['Python'],
        only_a: ['Airflow', 'SQL'],
        only_b: [],
        neither: ['Spark'],
      },
      {
        kind: 'other',
        label: 'Other skills on the CVs',
        both: ['Rust'],
        only_a: [],
        only_b: [],
        neither: [],
      },
    ],
    profile_differences: [
      { label: 'Years of experience', a_value: '8.0', b_value: '2.0', advantage: 'a' },
      { label: 'Highest education', a_value: 'Bachelor', b_value: 'PhD', advantage: 'b' },
      { label: 'Field of study', a_value: 'Computer Science', b_value: 'Mathematics', advantage: 'none' },
    ],
    decisive_factors: [
      'Skills: Ada Lovelace leads by 50 points on the criterion, which at a 50% weight is worth 25.0 points of the overall score (Ada Lovelace 3 of 4 required skills; Grace Hopper 1 of 4 required skills).',
    ],
    summary: 'Ada Lovelace is well ahead of Grace Hopper for the job.',
    ...overrides,
  }
}

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchJobs.mockResolvedValue({
      jobs: [
        { job_id: 9, title: 'Senior Data Engineer', company_name: 'Acme', ready_to_match: true, applications_count: 3 },
        { job_id: 12, title: 'Platform Engineer', company_name: 'Acme', ready_to_match: true, applications_count: 2 },
        { job_id: 14, title: 'Lonely Role', company_name: null, ready_to_match: true, applications_count: 1 },
      ],
    })
  })

  it('asks the API for the pair and the job in the URL', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')
    await waitFor(() => expect(fetchComparison).toHaveBeenCalledWith({ cvA: 71, cvB: 72, jobId: 9 }))
  })

  it('names the winner, the margin and the scores', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace leads by 30.0 points' })).toBeInTheDocument()
    expect(screen.getByText('Decisive lead')).toBeInTheDocument()
    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(screen.getByText('48%')).toBeInTheDocument()
    expect(screen.getByText('Scored against Senior Data Engineer')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace is well ahead of Grace Hopper for the job.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/candidates/1')
  })

  it('attributes the gap to each criterion, most decisive first', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    const { container } = renderAt('?cv_a=71&cv_b=72&job=9')
    await screen.findByText('Why one is better')

    const rows = container.querySelectorAll('.compare-criterion')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Skills')).toBeInTheDocument()
    expect(within(rows[0]).getByText('+25.0 pts')).toBeInTheDocument()
    expect(within(rows[0]).getByText('50% of the score')).toBeInTheDocument()
    expect(within(rows[0]).getByText('3 of 4 required skills')).toBeInTheDocument()
    // The criterion the other side wins is signed the other way.
    expect(within(rows[2]).getByText('−10.0 pts')).toBeInTheDocument()
    expect(screen.getByText(/Skills: Ada Lovelace leads by 50 points/)).toBeInTheDocument()
  })

  it('draws each side of a criterion at its own score', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    const { container } = renderAt('?cv_a=71&cv_b=72&job=9')
    await screen.findByText('Why one is better')

    const skills = container.querySelector('.compare-criterion')
    expect(within(skills).getByRole('img').getAttribute('aria-label')).toContain('Ada Lovelace 75%')
    expect(skills.querySelector('.compare-mirror-fill.side-a')).toHaveStyle({ width: '75%' })
    expect(skills.querySelector('.compare-mirror-fill.side-b')).toHaveStyle({ width: '25%' })
  })

  it('labels both sides by their file when they are the same person', async () => {
    fetchComparison.mockResolvedValue(
      makeComparison({
        mode: 'profile',
        job_id: null,
        winner: null,
        score_delta: null,
        margin: null,
        criteria: [],
        decisive_factors: [],
        a: makeSide({ label: 'lena-2026.pdf', candidate_name: 'Lena Fischer', overall_score: null, status: null }),
        b: makeSide({
          cv_id: 72,
          label: 'lena-2024.pdf',
          candidate_name: 'Lena Fischer',
          file_name: 'lena-2024.pdf',
          overall_score: null,
          status: null,
        }),
        skill_groups: [
          { kind: 'other', label: 'Skills', both: ['Python'], only_a: ['dbt'], only_b: [], neither: [] },
        ],
      }),
    )
    renderAt('?cv_a=71&cv_b=72')

    expect(await screen.findByRole('heading', { name: 'lena-2026.pdf vs lena-2024.pdf' })).toBeInTheDocument()
    expect(screen.getByText('Only lena-2026.pdf')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'lena-2024.pdf' })).toBeInTheDocument()
  })

  it('splits the skills into only-one, both and neither', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    const { container } = renderAt('?cv_a=71&cv_b=72&job=9')
    await screen.findByText('Skills side by side')

    const group = container.querySelector('.compare-skill-group')
    expect(within(group).getByText('Only Ada Lovelace')).toBeInTheDocument()
    expect(within(group).getByText('Only Grace Hopper')).toBeInTheDocument()
    expect(within(group).getByText('Airflow')).toBeInTheDocument()
    expect(within(group).getByText('Neither CV has: Spark')).toBeInTheDocument()
  })

  it('shows the unweighted profile differences with the advantage', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')
    await screen.findByText('Profile differences')

    const row = screen.getByText('Years of experience').closest('tr')
    expect(within(row).getByText('Ada Lovelace ahead')).toBeInTheDocument()
    const field = screen.getByText('Field of study').closest('tr')
    expect(within(field).getByText('Different, not better')).toBeInTheDocument()
  })

  it('swaps the sides through the URL', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')
    await screen.findByText('Why one is better')

    fireEvent.click(screen.getByRole('button', { name: 'Swap sides' }))

    await waitFor(() => expect(fetchComparison).toHaveBeenLastCalledWith({ cvA: 72, cvB: 71, jobId: 9 }))
  })

  it('re-scores the same pair against another job', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')
    await screen.findByText('Why one is better')
    expect(await screen.findByRole('radio', { name: /Senior Data Engineer/ })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: /Platform Engineer/ }))

    await waitFor(() => expect(fetchComparison).toHaveBeenLastCalledWith({ cvA: 71, cvB: 72, jobId: 12 }))
  })

  it('offers every job for re-scoring, and no job at all', async () => {
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')

    // Neither CV has to have applied, so a job with one application is fine.
    expect(await screen.findByRole('radio', { name: /Lonely Role/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('radio', { name: /No job — profiles only/ }))

    await waitFor(() => expect(fetchComparison).toHaveBeenLastCalledWith({ cvA: 71, cvB: 72, jobId: null }))
  })

  it('keeps the comparison when the job list fails to load', async () => {
    fetchJobs.mockRejectedValue(new Error('Jobs are down.'))
    fetchComparison.mockResolvedValue(makeComparison())
    renderAt('?cv_a=71&cv_b=72&job=9')

    expect(await screen.findByText('Jobs are down.')).toBeInTheDocument()
    expect(await screen.findByText('Why one is better')).toBeInTheDocument()
  })

  it('drops the job for a profile-only comparison and says nothing is scored', async () => {
    fetchComparison.mockResolvedValue(
      makeComparison({
        mode: 'profile',
        job_id: null,
        job_title: null,
        ready_to_match: false,
        winner: null,
        score_delta: null,
        margin: null,
        criteria: [],
        decisive_factors: [],
        a: makeSide({ overall_score: null, status: null, application_id: null }),
        b: makeSide({
          cv_id: 72,
          candidate_id: 2,
          candidate_name: 'Grace Hopper',
          overall_score: null,
          status: null,
          application_id: null,
        }),
        summary: 'No job was chosen, so neither CV has a score.',
      }),
    )
    renderAt('?cv_a=71&cv_b=72')

    await waitFor(() => expect(fetchComparison).toHaveBeenCalledWith({ cvA: 71, cvB: 72, jobId: null }))
    // No job is not the same failure as a job that cannot be scored.
    expect(
      screen.getByRole('heading', { name: 'Ada Lovelace vs Grace Hopper' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Not scored')).toHaveLength(2)
    expect(screen.getByText('No job selected — profiles only, nothing is scored')).toBeInTheDocument()
    expect(screen.getByText(/A score only means something against requirements/)).toBeInTheDocument()
    expect(screen.getByText('Profile differences')).toBeInTheDocument()
  })

  it('explains an unscorable job instead of naming a winner', async () => {
    fetchComparison.mockResolvedValue(
      makeComparison({
        ready_to_match: false,
        winner: null,
        score_delta: null,
        margin: null,
        criteria: [],
        decisive_factors: [],
        a: makeSide({ overall_score: null, status: 'unscorable' }),
        b: makeSide({ cv_id: 72, candidate_id: 2, candidate_name: 'Grace Hopper', overall_score: null, status: 'unscorable' }),
        summary: 'Neither CV can be scored against this job.',
      }),
    )
    renderAt('?cv_a=71&cv_b=72&job=9')

    expect(
      await screen.findByRole('heading', { name: 'No winner: this job cannot be scored' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no structured requirement to score against/)).toBeInTheDocument()
  })

  it('shows the API error with a retry', async () => {
    fetchComparison.mockRejectedValue(new Error('CV 99 not found.'))
    renderAt('?cv_a=71&cv_b=99&job=9')

    expect(await screen.findByRole('alert')).toHaveTextContent('CV 99 not found.')
    fetchComparison.mockResolvedValue(makeComparison())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Why one is better')
  })

  describe('picking a pair', () => {
    it('offers a job, then exactly two of its candidates', async () => {
      fetchJobMatches.mockResolvedValue({
        job_id: 9,
        job_title: 'Senior Data Engineer',
        total_applications: 3,
        returned_applications: 3,
        limit: 100,
        offset: 0,
        applications: [
          { rank: 1, application_id: 501, candidate_id: 1, cv_id: 71, candidate_name: 'Ada Lovelace', status: 'scored', overall_score: 77.5 },
          { rank: 2, application_id: 502, candidate_id: 2, cv_id: 72, candidate_name: 'Grace Hopper', status: 'scored', overall_score: 47.5 },
          { rank: 3, application_id: 503, candidate_id: 3, cv_id: 73, candidate_name: 'Alan Turing', status: 'scored', overall_score: 30 },
        ],
      })
      fetchComparison.mockResolvedValue(makeComparison())
      renderAt('')

      expect(await screen.findByRole('heading', { name: 'Compare two CVs' })).toBeInTheDocument()
      expect(fetchComparison).not.toHaveBeenCalled()

      fireEvent.click(await screen.findByRole('radio', { name: /Senior Data Engineer/ }))
      await waitFor(() => expect(fetchJobMatches).toHaveBeenCalledWith(9, { limit: 100, offset: 0 }))

      expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Compare selected' })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }))
      fireEvent.click(screen.getByRole('button', { name: /Grace Hopper/ }))

      expect(screen.getByRole('button', { name: /Ada Lovelace/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Ada Lovelace vs Grace Hopper')).toBeInTheDocument()
      // A third pick is refused rather than silently replacing one.
      expect(screen.getByRole('button', { name: /Alan Turing/ })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Compare selected' }))

      await waitFor(() => expect(fetchComparison).toHaveBeenCalledWith({ cvA: 71, cvB: 72, jobId: 9 }))
    })

    it('says when a job has too few applications to compare', async () => {
      fetchJobMatches.mockResolvedValue({
        job_id: 12,
        job_title: 'Platform Engineer',
        total_applications: 1,
        returned_applications: 1,
        limit: 100,
        offset: 0,
        applications: [
          { rank: 1, application_id: 601, candidate_id: 4, cv_id: 80, candidate_name: 'Solo', status: 'scored', overall_score: 50 },
        ],
      })
      renderAt('')

      fireEvent.click(await screen.findByRole('radio', { name: /Platform Engineer/ }))
      expect(
        await screen.findByText('This job has only one application — a comparison needs two.'),
      ).toBeInTheDocument()
    })

    it('does not offer a job with fewer than two applications', async () => {
      renderAt('')

      expect(await screen.findByRole('radio', { name: /Lonely Role/ })).toBeDisabled()
      expect(screen.getByText('Only one application.')).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /No job/ })).not.toBeInTheDocument()
    })

    it('starts from the job in the URL', async () => {
      fetchJobMatches.mockResolvedValue({ applications: [] })
      renderAt('?job=9')

      expect(await screen.findByRole('radio', { name: /Senior Data Engineer/ })).toBeChecked()
      await waitFor(() => expect(fetchJobMatches).toHaveBeenCalledWith(9, { limit: 100, offset: 0 }))
      expect(await screen.findByText(/No one has applied to this job yet/)).toBeInTheDocument()
    })
  })
})
