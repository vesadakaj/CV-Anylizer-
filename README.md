# CV Analyzer

An HR tool for one organisation: upload CVs, score them against a Job, and read an explainable ranking. Terminology lives in [CONTEXT.md](CONTEXT.md); decisions in [docs/adr](docs/adr).

## Backend

```bash
cd Backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                              # fill in LLM_API_KEY, the database, JWT_SECRET
alembic upgrade head
python -m scripts.create_admin                    # first Admin: prompts for email, name, password
uvicorn main:app --reload
```

`python -m scripts.create_admin` must run once after the migrations. Every other account is created by that Admin from the Users page. For non-interactive setups pass `--email`, `--full-name` and `--password-env VAR`.

Everything under `/api` except `POST /api/auth/login` requires a Bearer token from the login endpoint. `GET /health` is open.

## Frontend

```bash
cd Frontend
npm install
cp .env.example .env                              # VITE_API_URL=http://localhost:8000
npm run dev
```
