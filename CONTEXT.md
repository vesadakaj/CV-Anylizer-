# CV Analyzer

An HR tool for one organisation. Users upload CVs against a Job, and the tool ranks the resulting Applications with a deterministic, explainable score.

## Language

### Hiring

**Job**:
A role the organisation is hiring for, with structured requirements (required skills, years of experience, education level) that the scorer reads.
_Avoid_: Position, posting, role, vacancy

**Candidate**:
A person, identified by the email address extracted from their CVs. One Candidate may have several CVs and several Applications; a Candidate with no Application is Unattached.
_Avoid_: Applicant, resume, profile

**CV**:
One uploaded document (PDF or DOCX) and the Profile extracted from it. A Candidate's newest CV supplies their contact details.
_Avoid_: Resume, file, upload

**Profile**:
The structured details extracted from one CV: skills, work experience, education, languages, projects. A Profile belongs to its CV, never to the Candidate, so a later CV never changes an earlier Job's scores.
_Avoid_: Candidate info, extracted data

**Unlinkable**:
A CV whose Extraction found no email address, so it can never be merged with another CV of the same person and always creates a new Candidate.
_Avoid_: Anonymous, orphan

**Application**:
One Candidate being considered for one Job, scored from exactly one of that Candidate's CVs. At most one Application exists per Candidate and Job; a newer CV for the same Job replaces the CV the Application points at.
_Avoid_: Match, submission, candidate-for-job, entry

**Unattached**:
A CV (or the Candidate it belongs to) that has no Application yet. A User's own Unattached CVs are what the dashboard offers to score against a Job.
_Avoid_: Pending, pool, inbox

**Batch**:
The set of a User's Unattached CVs selected on the dashboard to be scored against one Job in a single action.
_Avoid_: Queue, session uploads

**Extraction**:
The one-time, job-independent step that turns a CV's text into a Candidate's structured details. Never influences scoring.
_Avoid_: Analysis, parsing, processing

### Scoring

**Match Result**:
The deterministic score, breakdown and explanation of one Application, computed when the Application is created and stored with it.
_Avoid_: Analysis, ranking entry

**Required skill / Preferred skill**:
A Job's skills are either required, which the scorer counts, or preferred, which are shown but never affect the score.
_Avoid_: Nice-to-have, optional, bonus skill

**Ready to match**:
A Job that has at least one scorable requirement (a required skill, a positive years-of-experience figure, or a recognisable education level).
_Avoid_: Complete, valid job

**Unscorable**:
An Application whose Job has no available criterion, so no Match Result exists for it.
_Avoid_: Zero score, failed match

**Comparison**:
Two CVs read head to head, optionally against one Job. It re-runs the same deterministic scorer and splits the gap between the two overall scores across the Job's criteria; it stores nothing and creates no Application (ADR 0004). Without a Job it names no winner and shows the factual Profile differences only.
_Avoid_: Versus, duel, A/B test

**Contribution**:
How many points of a Comparison's overall gap one criterion is responsible for: the two sides' scores on it, times the weight the Job gives it. The contributions of every criterion add up to the gap.
_Avoid_: Impact, importance, factor weight

### Access

**User**:
A person with a login to the organisation's CV Analyzer. Every User sees the same Jobs, Candidates and Applications.
_Avoid_: Account, HR manager, operator

**Admin**:
A User who can additionally create, deactivate, reset and change the role of Users. Nothing else differs from a Member. The organisation always keeps at least one active Admin.
_Avoid_: Superuser, owner

**Member**:
A User without user-management rights.
_Avoid_: Regular user, staff, viewer
