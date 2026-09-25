# CV Analyzer

An HR tool for one organisation: upload CVs, score them against a Job, and read an explainable ranking. Every User sees the same Jobs, Candidates and Applications; Admins additionally manage Users.

- Terminology (Job, Candidate, CV, Profile, Application, Unattached, Unlinkable, Match Result, Comparison, …): [CONTEXT.md](CONTEXT.md)
- Decisions and why: [docs/adr](docs/adr) — the Profile belongs to the CV (0001), one organisation with no tenancy (0002), Bearer JWT without refresh (0003), a Comparison explains the score rather than producing one (0004)

## How it fits together

- **Backend** (`Backend/`): FastAPI + SQLAlchemy + Alembic. MSSQL in production (Windows integrated auth); any SQLAlchemy URL works via `DATABASE_URL`. The LLM (Anthropic) is used only for extraction, never for scoring.
- **Frontend** (`Frontend/`): React + Vite, talking to the API with a Bearer token.
- **Flow**: upload CVs on the dashboard (they are Unattached until scored) → pick a Job → score the batch → read the breakdown. Jobs can also take uploads directly, and a Candidate can be added to another Job later.
- **Comparing two CVs**: tick two rows in a Job's ranking (or two CVs on a Candidate's page, or use the Compare page) to see which is the better match and why — the gap between the two scores is split across the Job's criteria, so the reasons add up to the difference. It is a pure read: nothing is created or rescored (ADR 0004).

## Backend

### Environment

Copy `Backend/.env.example` to `Backend/.env` and fill in:

| Variable | Required | Meaning |
| --- | --- | --- |
| `LLM_API_KEY` | yes | Anthropic API key for CV and job-description extraction. Missing key fails at the first extraction, not at startup. |
| `DATABASE_URL` | one of the two | Full SQLAlchemy URL, e.g. `mssql+pyodbc://...` or `sqlite:///./local.db`. Wins when set. |
| `DB_SERVER`, `DB_NAME`, `DB_DRIVER` | one of the two | Otherwise the MSSQL connection string is built from these (`Trusted_Connection=yes`, `TrustServerCertificate=yes`). |
| `JWT_SECRET` | yes | Signs login tokens (HS256, 12 hours). The API refuses to start without it. Use 32+ random bytes, e.g. `openssl rand -hex 32`. |
| `CORS_ORIGINS` | no | Comma-separated browser origins allowed to call the API. Default `http://localhost:5173`. |

### Run

```bash
cd Backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                              # fill in the table above
alembic upgrade head                              # creates every table from an empty database
python -m scripts.create_admin                    # first Admin: prompts for email, name, password
uvicorn main:app --reload                         # http://localhost:8000
```

`python -m scripts.create_admin` runs once, after the migrations. It refuses an email that already exists. For non-interactive setups:

```bash
python -m scripts.create_admin --email admin@example.com --full-name "Ada Admin" --password-env ADMIN_PASSWORD
```

Every other account is created by that Admin from the Users page, with a temporary password the new user must change at first sign-in.

Everything under `/api` except `POST /api/auth/login` requires `Authorization: Bearer <token>` from the login endpoint. `GET /health` is open. Interactive API docs are at `http://localhost:8000/docs`.

### Tests

```bash
cd Backend
python -m pytest -q
```

The suite runs on an in-memory SQLite database and never touches the database in `.env`; it sets `DATABASE_URL=sqlite://` itself. No `pyodbc` stub is needed on Linux or macOS any more: the engine is created lazily, so importing the app does not require an ODBC driver. `pyodbc` (and unixODBC) are only needed on the machine that actually connects to MSSQL.

To exercise the migrations without MSSQL: `DATABASE_URL=sqlite:///./scratch.db alembic upgrade head`.

## Frontend

### Environment

Copy `Frontend/.env.example` to `Frontend/.env`:

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | Base URL of the API, e.g. `http://localhost:8000`. Must be one of the backend's `CORS_ORIGINS` callers. |

### Run

```bash
cd Frontend
npm install
cp .env.example .env
npm run dev                                       # http://localhost:5173
```

`npm run build` produces `Frontend/dist/`; `npm run preview` serves it.

### Tests and lint

```bash
cd Frontend
npm test          # vitest, jsdom; every API call is mocked in src/test/setup.js
npm run lint      # oxlint; prints nothing when clean
```

## Bringing up a new machine

1. Backend: install, `.env`, `alembic upgrade head`, `python -m scripts.create_admin`, `uvicorn main:app --reload`.
2. Frontend: install, `.env`, `npm run dev`.
3. Sign in with the Admin, create the other Users from the Users page, then upload CVs on the dashboard.

## Repository layout

```
Backend/
  main.py             app, CORS, router wiring, the open-routes allowlist
  database.py         lazy engine, DATABASE_URL / DB_* resolution
  models/             one file per table
  routers/            auth, users, cv (upload), cvs (read), job, candidates, applications, comparisons
  services/           extraction (LLM), persistence, matching (deterministic), comparison, applications, auth
  alembic/versions/   migrations, apply with `alembic upgrade head`
  scripts/            create_admin.py
  tests/
Frontend/
  src/pages/          Dashboard, Jobs, Job detail, Matches, Compare, Candidates, Users, Login, Change password
  src/components/     cards and dialogs shared by the pages
  src/lib/            apiFetch (Bearer + 401 handling), *Api.js per resource, upload queue hook
  src/test/setup.js   global test setup (mocks apiFetch once)
CONTEXT.md            glossary
docs/adr/             architecture decision records
```
