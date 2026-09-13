# CV Analyzer frontend

React + Vite client for the CV Analyzer API. Setup, environment variables and the full run sequence are in the [repository README](../README.md).

```bash
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:8000
npm run dev               # http://localhost:5173
npm test                  # vitest
npm run lint              # oxlint
npm run build             # dist/
```

The session token lives in `localStorage`; every API call goes through `src/lib/apiFetch.js`, which adds the Bearer header and sends the user back to `/login` on any 401.
