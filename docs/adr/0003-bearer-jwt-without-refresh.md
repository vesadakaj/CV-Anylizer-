---
status: accepted
date: 2026-09-13
---
# Bearer JWT with a 12-hour lifetime and no refresh tokens

The SPA and the API run on different origins in development, which makes cookie sessions need credentialed CORS and CSRF protection. We issue a signed JWT on login, the SPA sends it as a Bearer header, and it expires after 12 hours (a working day). There are no refresh tokens: an expired or rejected token sends the user back to the login page. Revocation is handled by reloading the User on every request and rejecting inactive accounts, so deactivation takes effect immediately despite the stateless token.
