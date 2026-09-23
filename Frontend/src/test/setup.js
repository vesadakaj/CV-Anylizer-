import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Every API module goes through `apiFetch` (W1.7). It is mocked once here so
// no test can reach the network: a call that a test did not mock at the
// module level (`vi.mock('../lib/jobsApi', ...)`) fails loudly instead of
// hanging on `fetch`. Tests of apiFetch itself use `vi.importActual`.
vi.mock('../lib/apiFetch', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    apiFetch: vi.fn((path) =>
      Promise.reject(new Error(`apiFetch('${path}') was called but not mocked in this test`)),
    ),
  }
})
