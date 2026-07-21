# Flodata Digital Twin

This monorepo contains three independently hosted services:

- `backend/` — Express/TypeScript API (port `4000` locally)
- `cesium_demo/` — Vite/Cesium user viewer (port `5500` locally)
- `admin/` — Vite/React admin panel (port `5600` locally)

The browser apps talk to the backend through an explicit `VITE_API_BASE_URL`.
They do not proxy API traffic through their own static hosts.

## Run locally

Install all dependencies:

```bash
npm install
cd backend && npm install
cd ../cesium_demo && npm install
cd ../admin && npm install
cd ..
```

Create the environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp cesium_demo/.env.example cesium_demo/.env
cp admin/.env.example admin/.env
```

In both frontend environment files, point the apps at the standalone backend:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

Run all three services:

```bash
npm run dev
```

The API is then available at `http://localhost:4000/api`, with its health check
at `http://localhost:4000/api/health`.

## Host the backend separately on Render

The root `render.yaml` declares `gis-platform-backend` as an independent Node
web service. It uses `backend/` as its root directory and runs:

```text
Build: npm ci && npm run build
Start: npm start
Health check: /api/health
```

Create or sync the repository as a Render Blueprint, then provide these required
backend environment variables in Render:

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CORS_ORIGIN=https://your-viewer-host,https://your-admin-host
ADMIN_PANEL_URL=https://your-admin-host
USER_PANEL_URL=https://your-viewer-host
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be placed in either
frontend environment.

After the backend deploys, copy its public URL into both static services. The
value must include `/api`:

```env
VITE_API_BASE_URL=https://gis-platform-backend.onrender.com/api
```

Redeploy both frontends after changing a `VITE_*` value because Vite embeds
these variables at build time. Verify the standalone backend with:

```bash
curl https://gis-platform-backend.onrender.com/api/health
```

Optional backend integrations are configured with `GOOGLE_SOLAR_API_KEY`,
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME`, and `ADMIN_EMAIL`.

## Individual development commands

```bash
npm run dev:backend
npm run dev:cesium
npm run dev:admin
```
