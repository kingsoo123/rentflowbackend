# Deploying `real_estate_backend` on Render

Use a **Web Service** pointed at this package (in a monorepo, set **Root Directory** to `real_estate_backend`, or use the repo-level `render.yaml` with `rootDir: real_estate_backend`).

## Build and start commands

| Field | Value |
|--------|--------|
| **Environment** | `Node` |
| **Build command** | `npm ci && npm run build` (or `npm install && npm run build`) |
| **Start command** | `npm start` or `npm run start:prod` (both run `node dist/main`) |

Do **not** leave **`PORT`** set to an empty string in the Render dashboard — that used to fail validation; the app now strips blank `PORT`, but omit the variable entirely and let Render inject it.

This repo keeps **build-time tools** (`@nestjs/cli`, `typescript`, `ts-loader`, `dotenv`) in **`dependencies`** so a normal install under **`NODE_ENV=production`** still runs **`nest build`**. You should no longer see **exit 127** (`nest: not found`) from omitted devDependencies.

If you prefer not to ship the CLI in `dependencies`, use instead: **`npm ci --include=dev && npm run build`**.

**Node.js:** **`engines.node`** is set in `package.json`. You can still pin a patch with **`NODE_VERSION`** ([Render: Node version](https://render.com/docs/node-version)).

## Database migrations

**Property manager signup** (`POST /api/auth/signup` with `role: property_manager`) creates rows in the **`properties`** table. If you see **`503` / “Database is missing the properties table”**, migrations have not been applied to the database this API uses — run them below.

After the first deploy or whenever new migrations ship:

- **Option A (recommended in Blueprint):** This repo’s root `render.yaml` sets **`preDeployCommand: npm run typeorm:migration:run`** on the backend service so each deploy applies pending migrations before the new version goes live. If your Render plan or service type does not support pre-deploy, use Option B.
- **Option B:** Render **Shell** for the Web Service (working directory is usually **`real_estate_backend`** when `rootDir` is set):  
  `npm run typeorm:migration:run`  
  If Shell opens at repo root: `cd real_estate_backend && npm run typeorm:migration:run`
- **Option C:** One-off **Background Worker** or script with the same **`DATABASE_URL`** as the API.

Do **not** set `TYPEORM_SYNCHRONIZE=true` in production unless you fully accept schema drift risks.

---

## Environment variables

Set these in the Render dashboard: **Environment** → **Environment Variables** (or link a **Secret** file).

If you use a **Render PostgreSQL** instance in the same Blueprint, you can wire the connection string instead of pasting it:

```yaml
envVars:
  - key: DATABASE_URL
    fromDatabase:
      name: your-db-name   # must match databases[].name in render.yaml
      property: connectionString
```

Add a top-level `databases:` block per [Render blueprint databases](https://render.com/docs/blueprint-spec).

### Required

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` (required so `JWT_SECRET` is enforced and defaults stay secure). |
| `DATABASE_URL` | PostgreSQL connection URI (`postgresql://...`). Must include the **database name** in the path (e.g. `/mydb` or `/postgres`). URL-encode special characters in the password (`@` → `%40`, etc.). This app validates the URL at startup. |
| `JWT_SECRET` | Secret for signing access tokens. **At least 16 characters** in production (see `auth.module.ts`). Generate a long random string (e.g. `openssl rand -base64 32`). |

### Strongly recommended

| Variable | Description |
|----------|-------------|
| `CORS_ORIGIN` | Comma-separated list of allowed browser origins for your frontend (e.g. `https://your-app.vercel.app` or `https://rent-pilot.onrender.com`). If omitted in development the API allows all origins; in production you should restrict this to your real frontend URL(s). |

Render injects **`PORT`** automatically; the app listens on `process.env.PORT` (default `3001` if unset, which is fine locally but Render will override).

### PostgreSQL / TypeORM tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_SSL` | *(auto)* | `true` forces TLS with `rejectUnauthorized: false`. `false` disables SSL (local DB only). Omit for managed cloud Postgres (Supabase, Render Postgres, etc.) — the app enables TLS when the host is not localhost. |
| `DATABASE_POOL_MAX` | `10` | Max connections in the `pg` pool. |
| `DATABASE_RESOLVE_IPV4` | *(enabled)* | Set to `false` to skip IPv4 hostname resolution (only needed if you hit connection issues with a specific host). |
| `TYPEORM_LOGGING` | `false` if unset | Set to `true` only for debugging (noisy logs). |
| `TYPEORM_SYNCHRONIZE` | `false` if unset | Set to `true` **only** in non-production experiments; never for production. |

### Optional — email (Resend)

Rent renewal emails are skipped if unset; in-app notifications still work.

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | API key from [Resend](https://resend.com). |
| `RESEND_FROM` | Verified sender, e.g. `EstateFlow <notifications@yourdomain.com>`. Defaults to Resend’s onboarding address if unset. |

### Optional — Firebase Cloud Messaging (Android)

FCM is **off** until credentials are set. The mobile app stores **Android** FCM tokens via `POST /api/device-push-token`; the server sends pushes when tenant in-app notifications are created (renewal, maintenance status, portfolio broadcast).

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Base64-encoded contents of your Firebase **service account** JSON (Firebase Console → Project settings → Service accounts → Generate new private key). Single line, no newlines. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternative for some hosts: absolute path to the JSON key file (less common on Render; prefer base64 env). |

---

## Frontend + WebSockets

- HTTP API is under the global prefix **`/api`** (e.g. `https://<service>.onrender.com/api/health`).
- Socket.IO uses the **same host and port** as the HTTP server. Point your frontend’s API base URL and Socket.IO client at this origin so JWT + CORS + cookies (if you add them later) stay consistent.

---

## Checklist before going live

1. `NODE_ENV=production`
2. `DATABASE_URL` from Render Postgres or external provider (path includes DB name).
3. `JWT_SECRET` ≥ 16 characters.
4. `CORS_ORIGIN` includes your deployed frontend origin(s).
5. Run `npm run typeorm:migration:run` at least once against that database.
6. Smoke-test: `GET https://<your-service>.onrender.com/api/health`
