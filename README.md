# LinePros-Billing

A small full-stack billing platform: manage customers, issue invoices with line
items, and record payments. Built as a workspace with an Express + SQLite API and
a React (Vite) front end.

## Stack

- **Server** (`server/`) — Node.js, Express, `better-sqlite3`. REST API on port `4000`.
- **Client** (`client/`) — React + Vite + TypeScript. Dev server on port `5173`, proxies `/api` to the server.
- **Data** — SQLite file stored under `server/data/` (git-ignored). No external services required.

## Getting started

```bash
npm install        # install all workspaces
npm run seed       # (optional) load demo customers/invoices
npm run dev        # start API (4000) + client (5173) together
```

Then open http://localhost:5173.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run server and client together (hot reload). |
| `npm run dev:server` | Run only the API. |
| `npm run dev:client` | Run only the front end. |
| `npm run seed` | Seed demo data (`npm run seed -- --force` to reset). |
| `npm run build` | Build the client for production. |
| `npm test` | Run the server API tests. |

## Production deploy

See [deploy/README.md](deploy/README.md). Summary:

- One Docker container serves the UI and API.
- Secrets live in a droplet-only `.env` (`chmod 600`). **Never commit `.env`.**
- Generate `LINEPROS_ADMIN_PASSWORD_HASH` on your laptop with `node deploy/hash-password.mjs` so the plaintext password never touches the server.
- Production refuses to start without a session secret and a password hash.

## Security notes

- Local `npm run dev` has auth **off** so development stays easy.
- Production (`NODE_ENV=production`) has auth **on**. All `/api/*` routes except `/api/health`, `/api/login`, and `/api/logout` require a session cookie.
- `.gitignore` excludes `.env`, SQLite files, keys, and credential JSON. Do not force-add those files.

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health check. |
| `GET` | `/api/stats` | Dashboard totals. |
| `GET/POST` | `/api/customers` | List / create customers. |
| `GET/POST` | `/api/invoices` | List / create invoices (with line items). |
| `GET` | `/api/invoices/:id` | Invoice detail with items and payments. |
| `POST` | `/api/invoices/:id/payments` | Record a payment (auto-marks paid). |
