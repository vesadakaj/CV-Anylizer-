---
status: accepted
date: 2026-09-13
---
# One organisation, shared data, no tenancy

The user system serves one HR organisation. Every User sees every Job, Candidate and Application. We record who created each Job and who uploaded each CV, and the dashboard uses "my Unattached CVs" as a convenience filter, but no query restricts data by owner and no tenant column exists. Adding tenancy later means touching every query; we accept that cost because nothing in the product asks for it today, and half-built tenancy is worse than none.
