# Frontend (Phase 5)

The dashboard (React + Vite) will live here. It is intentionally not scaffolded
yet — Phase 1 focuses on a reliable backend foundation.

Planned views:
- **Balances** — HBL / ABL / NayaPay / Total (when balance data is reliable)
- **Monthly spending** — bar chart by month
- **Income vs expenses** — income / expenses / net
- **Provider breakdown** — HBL / ABL / NayaPay
- **Transaction list** — Date, Provider, Type, Amount, Description, Source,
  Confidence, Verified

It will consume the existing API:
- `GET /api/v1/transactions` (filter + paginate)
- `GET /api/v1/analytics/summary`
- `GET /api/v1/analytics/monthly`
- `GET /api/v1/export/csv`

To scaffold later:

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm run dev   # http://localhost:5173 (CORS already allowed by the backend)
```
