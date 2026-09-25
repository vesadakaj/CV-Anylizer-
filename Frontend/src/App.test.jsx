import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './lib/auth'
import { fetchCurrentUser, login } from './lib/authApi'
import { fetchUsers } from './lib/usersApi'
import { clearToken, getToken, notifyUnauthorized, setToken } from './lib/session'

vi.mock('./lib/authApi', () => ({
  login: vi.fn(),
  fetchCurrentUser: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('./lib/jobsApi', () => ({
  fetchJobs: vi.fn(() => Promise.resolve({ jobs: [] })),
  fetchJob: vi.fn(),
  analyzeJob: vi.fn(),
  scoreCvsAgainstJob: vi.fn(),
  fetchApplicationMatch: vi.fn(),
  fetchJobMatches: vi.fn(),
  createJob: vi.fn(),
  analyzeJobPreview: vi.fn(),
}))
vi.mock('./lib/cvApi', () => ({
  uploadCv: vi.fn(),
  fetchUnattachedCvs: vi.fn(() => Promise.resolve([])),
  fetchCv: vi.fn(),
}))
vi.mock('./lib/candidatesApi', () => ({
  fetchCandidates: vi.fn(() => Promise.resolve({ candidates: [], total: 0, limit: 20, offset: 0 })),
  fetchCandidate: vi.fn(),
  addCandidateToJob: vi.fn(),
}))
vi.mock('./lib/usersApi', () => ({
  fetchUsers: vi.fn(() => Promise.resolve([])),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetUserPassword: vi.fn(),
}))

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function user(overrides = {}) {
  return {
    id: 1,
    email: 'mem@example.com',
    full_name: 'Mem Ber',
    role: 'member',
    is_active: true,
    must_change_password: false,
    ...overrides,
  }
}

describe('App - session and route guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearToken()
  })

  afterEach(() => {
    clearToken()
  })

  it('an unauthenticated visit to /jobs lands on /login and comes back after signing in', async () => {
    login.mockResolvedValue({ token: 'tok', user: user() })
    renderApp('/jobs')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchCurrentUser).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mem@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('mem@example.com', 'secret123'))
    // `next` was honoured: the Jobs page, not the dashboard.
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument()
    expect(getToken()).toBe('tok')
  })

  it('a wrong password shows one error line and stays on the login page', async () => {
    const error = new Error('Email or password is incorrect.')
    error.status = 401
    login.mockRejectedValue(error)
    renderApp('/login')

    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'x@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('a stored token is confirmed with /api/auth/me before anything renders', async () => {
    setToken('stored')
    fetchCurrentUser.mockResolvedValue(user())
    renderApp('/jobs')

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument()
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('a 401 mid-session ends the session and redirects to /login with next', async () => {
    setToken('stored')
    fetchCurrentUser.mockResolvedValue(user())
    renderApp('/candidates')
    expect(await screen.findByRole('heading', { name: 'Candidates' })).toBeInTheDocument()

    // What apiFetch does on any 401 (see lib/apiFetch.js).
    clearToken()
    notifyUnauthorized()

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(getToken()).toBeNull()

    login.mockResolvedValue({ token: 'tok2', user: user() })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mem@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Candidates' })).toBeInTheDocument()
  })

  it('a user who must change their password sees only that page', async () => {
    setToken('stored')
    fetchCurrentUser.mockResolvedValue(user({ must_change_password: true }))
    renderApp('/jobs')

    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jobs' })).not.toBeInTheDocument()
  })

  it('logging out returns to /login', async () => {
    setToken('stored')
    fetchCurrentUser.mockResolvedValue(user())
    renderApp('/')
    await screen.findByRole('button', { name: 'Logout' })

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})

describe('App - sidebar and the Users page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setToken('stored')
  })

  afterEach(() => {
    clearToken()
  })

  it('members see Dashboard, Jobs, Candidates and Compare, with no disabled entries and no Users link', async () => {
    fetchCurrentUser.mockResolvedValue(user())
    renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Main' })

    const links = within(nav).getAllByRole('link').map((link) => link.textContent)
    expect(links).toEqual(['Dashboard', 'Jobs', 'Candidates', 'Compare'])
    expect(nav.querySelectorAll('[aria-disabled="true"], [disabled]')).toHaveLength(0)
    expect(screen.queryByText('Resumes')).not.toBeInTheDocument()
    // The topbar shows the real name, not a placeholder.
    expect(screen.getByText('Mem Ber')).toBeInTheDocument()
    expect(screen.queryByText('HR Manager')).not.toBeInTheDocument()
  })

  it('members get the not-found page for /users', async () => {
    fetchCurrentUser.mockResolvedValue(user())
    renderApp('/users')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(fetchUsers).not.toHaveBeenCalled()
  })

  it('admins get a Users link and the Users page', async () => {
    fetchCurrentUser.mockResolvedValue(user({ role: 'admin', full_name: 'Ada Admin' }))
    fetchUsers.mockResolvedValue([user({ role: 'admin', full_name: 'Ada Admin' })])
    renderApp('/users')

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users')
    await waitFor(() => expect(fetchUsers).toHaveBeenCalled())
  })
})
