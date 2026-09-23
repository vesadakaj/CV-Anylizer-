import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExtractedInfo from './ExtractedInfo'

function candidateWith({ skills = [], languages = [] }) {
  return {
    full_name: 'Jane Doe',
    email: null,
    phone: null,
    location: null,
    education: [],
    work_experience: [],
    projects: [],
    skills,
    languages,
  }
}

describe('ExtractedInfo', () => {
  let consoleError

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders duplicate skill and language names without a key warning', () => {
    render(
      <ExtractedInfo
        candidate={candidateWith({
          skills: [
            { name: 'Python', proficiency_level: null, years_experience: null },
            { name: 'Python', proficiency_level: 'Expert', years_experience: 5 },
          ],
          languages: [
            { name: 'English', level: null },
            { name: 'English', level: 'C1' },
          ],
        })}
      />,
    )

    expect(screen.getAllByText('Python')).toHaveLength(2)
    expect(screen.getAllByText(/English/)).toHaveLength(2)
    const keyWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('same key'),
    )
    expect(keyWarnings).toEqual([])
  })

  it('prefers a server-provided id as the key when present', () => {
    render(
      <ExtractedInfo
        candidate={candidateWith({
          skills: [
            { id: 7, name: 'SQL' },
            { id: 8, name: 'SQL' },
          ],
        })}
      />,
    )

    expect(screen.getAllByText('SQL')).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
  })
})
