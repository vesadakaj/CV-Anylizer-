import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch as mockedApiFetch } from './apiFetch'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './session'

// The real module: test/setup.js replaces `apiFetch` everywhere else.
const { apiFetch, parseJsonResponse } = await vi.importActual('./apiFetch')

function response(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  }
}

describe('apiFetch', () => {
  let fetchSpy
  let unregister

  beforeEach(() => {
    clearToken()
    fetchSpy = vi.fn(() => Promise.resolve(response(200)))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    unregister?.()
    vi.unstubAllGlobals()
    clearToken()
  })

  it('is mocked for every other test by test/setup.js', () => {
    expect(vi.isMockFunction(mockedApiFetch)).toBe(true)
    expect(vi.isMockFunction(apiFetch)).toBe(false)
  })

  it('adds the Bearer header when a token is stored', async () => {
    setToken('tok')
    await apiFetch('/api/jobs')
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.get('Authorization')).toBe('Bearer tok')
  })

  it('sends no Authorization header without a token', async () => {
    await apiFetch('/api/jobs')
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.has('Authorization')).toBe(false)
  })

  it('a 401 clears the token and notifies the session handler', async () => {
    setToken('tok')
    const handler = vi.fn()
    unregister = setUnauthorizedHandler(handler)
    fetchSpy.mockResolvedValue(response(401))

    await apiFetch('/api/jobs')

    expect(getToken()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('the login request opts out of the 401 redirect', async () => {
    const handler = vi.fn()
    unregister = setUnauthorizedHandler(handler)
    fetchSpy.mockResolvedValue(response(401))

    await apiFetch('/api/auth/login', { method: 'POST', skipAuthRedirect: true })

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('parseJsonResponse', () => {
  it('turns a FastAPI 422 detail list into one message', async () => {
    await expect(
      parseJsonResponse(response(422, { detail: [{ msg: 'field required' }, { msg: 'too short' }] })),
    ).rejects.toMatchObject({ message: 'field required too short', status: 422 })
  })

  it('surfaces a non-JSON success as a configuration hint', async () => {
    const html = { status: 200, ok: true, json: () => Promise.reject(new Error('not json')) }
    await expect(parseJsonResponse(html)).rejects.toThrow(/VITE_API_URL/)
  })
})
