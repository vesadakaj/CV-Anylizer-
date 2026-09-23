---
status: accepted
date: 2026-09-13
---
# The extracted profile belongs to the CV, not the Candidate

Skills, work experience, education, languages and projects used to hang off the Candidate. Once one person can apply to several Jobs, and can send a newer CV later, a person-level profile means an upload for Job B silently changes Job A's ranking. We moved the profile to the CV row and made each Application point at exactly one CV, so every Job scores the document it actually received. The Candidate keeps only identity and contact details, refreshed from the newest CV.

## Considered options

- **Profile on the Candidate, latest CV wins.** Simplest; rejected because rankings would change behind the user's back.
- **Profile on the Application.** Impossible in practice: extraction happens at upload, before any Job is chosen.
- **Profile on the CV.** Chosen. Also gives "add this Candidate to another Job" a natural CV picker.

## Consequences

- Deduplication of people is by normalised email only; a CV without an email is Unlinkable and always creates a new Candidate.
- Re-uploading for the same Job creates a new CV and repoints the existing Application; it never creates a second Application.
