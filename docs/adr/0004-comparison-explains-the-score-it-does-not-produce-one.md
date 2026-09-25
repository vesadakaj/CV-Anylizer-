---
status: accepted
date: 2026-09-25
---
# A Comparison explains the score, it does not produce one

Comparing two CVs is the question a user actually asks ("why is this one better?"), and the tempting answer is a second opinion: send both documents to the LLM and let it argue. We did not. A Comparison scores both CVs with the one deterministic algorithm in `services/matching.py`, through its public `score_cv_against_job`, and then *attributes* the gap: every criterion the Job specifies carries the same effective weight for both sides, so `(a_score − b_score) × weight` is exactly how many points of the overall difference that criterion owns, and those contributions sum back to the difference. "Why one is better" is therefore arithmetic that a user can check against the ranking, not prose that can quietly contradict it.

Without a Job the comparison refuses to name a winner and shows the factual diff instead (skills on one side only, years, education level, languages). A score against nothing is not a smaller truth, it is a different claim.

## Considered options

- **Ask the LLM to compare the two documents.** Rejected: it would be the only place in the product where a hiring judgement comes from a model, it could disagree with the ranking on the same screen, and it would not be reproducible.
- **Compare stored Match Results only.** Rejected: it would make comparison impossible for a CV that was never applied to the Job, which is half of what people want it for (two candidates under consideration, two versions of one person's CV).
- **Rescore both CVs on read and attribute the gap.** Chosen. The comparison is a pure read - it creates no Application and stores no Match Result - so looking at two people never changes the ranking they are in.

## Consequences

- `GET /api/comparisons?cv_a=&cv_b=&job_id=` writes nothing; the stored Match Results and their `algorithm_version` are untouched by it.
- The criteria a Comparison shows are the Job's, so a Job with no usable requirement produces no winner, exactly as an Unscorable Application produces no Match Result.
- Preferred skills, other skills and languages appear in the diff but never in the attribution, matching the scorer's own rule.
