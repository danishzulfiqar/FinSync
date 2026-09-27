# FinSync Dashboard

A polished personal-finance dashboard for Pakistani banks (Allied Bank, HBL,
NayaPay). Built with **Vite + React + TypeScript + Tailwind CSS** and deployable
on **Vercel**. Design inspired by [Actual Budget](https://actualbudget.org) and
[FinLens](https://github.com/danishzulfiqar/FinLens).

> **Status:** UI + synthetic data only. It runs entirely on local JSON fixtures
> (`src/data/*.json`) — no backend wiring yet. Create-account and statement
> import mutate in-memory state so the flows are fully interactive.

## Features

- **Overview** — KPI cards (balance, income, spending, net saved), cash-flow
  area chart, spending donut, account summary and recent transactions.
- **Transactions** — searchable, filterable ledger (account, category, money
  in/out), inline category editing, live totals and CSV export.
- **Accounts** — card-style balances, net worth, and an **Add account** flow.
- **Categories** — net-savings trend, top categories and monthly budget tracker.
- **Import** — drag-and-drop statement upload with a mocked parse + review step,
  plus a Gmail connect placeholder.
- Light / dark mode, responsive layout, keyboard-accessible modal.

## Getting started

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Build & preview:

```bash
npm run build
npm run preview
```

## Deploy to Vercel

The repo includes `vercel.json` (framework: `vite`, SPA rewrites). Either:

- Import the repo in the Vercel dashboard and set the **root directory** to
  `frontend`, or
- From this folder run `vercel` (build command `npm run build`, output `dist`).

## Project structure

```
src/
  components/   layout, ui primitives, charts, transactions, accounts
  context/      ThemeContext (light/dark), AppDataContext (in-memory store)
  data/         synthetic JSON: accounts, transactions, categories
  lib/          format helpers + analytics (KPIs, aggregations)
  pages/        Dashboard, Transactions, Accounts, Categories, Upload
  types.ts      shared domain types
```

## Next steps (backend wiring)

Swap the JSON seeds in `AppDataContext` for the existing API:

- `GET /api/v1/transactions` (filter + paginate)
- `GET /api/v1/analytics/summary` · `GET /api/v1/analytics/monthly`
- `GET /api/v1/export/csv`
- Gmail sync via the backend's read-only OAuth flow.
