<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

Copy `.env.example` to `.env` and set `DATABASE_URL` to your Supabase Postgres URI (Dashboard → **Project Settings** → **Database** → connection string). For the transaction pooler (port `6543`), keep `?pgbouncer=true` on the URI as Supabase documents.

The URI **must** include **`/postgres`** before any `?` (see `docs/supabase-postgres-url.md` if you see “database does not exist”).

Default HTTP port is **3001** so the Next.js app in this repo can use **3000**. Set `CORS_ORIGIN` to your frontend origin (for example `http://localhost:3000`).

After configuring the database, create the `users` table:

```bash
npm run typeorm:migration:run
```

(or set `TYPEORM_SYNCHRONIZE=true` temporarily in development only).

- `GET /api` — hello check
- `GET /api/health` — Terminus health check including a database ping
- `POST /api/auth/signup` — register with JSON body `{ name, role, email, password, confirmPassword, terms }` (`role`: `property_manager` | `tenant`, same as the EstateFlow signup form). For **`property_manager`**, include **`propertyNames`**: a string of comma-separated property names (trimmed, deduped case-insensitively server-side; each name ≤200 chars). Rows are stored in **`properties`** with a unique constraint per manager on **`lower(trim(name))`** so each property is a distinct record for assigning tenants later.
- `POST /api/auth/login` — JSON `{ email, password, remember? }`; returns `{ accessToken, tokenType, expiresIn, user }`. Set `JWT_SECRET` (≥16 chars) in production.
- `GET /api/tenants/maintenance-requests` — **tenant** JWT only; returns all of the tenant’s maintenance rows (newest first). The overview UI filters out `status: resolved` as inactive.
- `POST /api/tenants/maintenance-requests` — **tenant** JWT only; JSON `{ title, description, urgency, attachmentUrls? }` (`urgency`: `low` | `normal` | `high` | `emergency`; optional `attachmentUrls`: up to 10 HTTPS URLs). Requires migration `CreateMaintenanceRequestsTable1761100000000` (`npm run typeorm:migration:run`). On success, **each property manager whose occupancy roster includes this tenant** (same `propertyAssigned` ↔ `properties.name` rules as `GET /api/managers/tenants`) receives Socket.IO **`maintenance:created`** on namespace `/managers/maintenance` (see below). If no manager’s portfolio matches the tenant’s assignment, no manager socket event is sent (the request is still stored for the tenant).
- `POST /api/tenants/maintenance-requests/upload` — **tenant** JWT only; `multipart/form-data` with field **`file`** (one image, ≤5MB). Saves under `uploads/maintenance/` and serves at **`GET /api/uploads/maintenance/:filename`**. Response JSON `{ path, url }` — mobile clients should build `attachmentUrls` entries as `{API_BASE}{path}` so URLs match their configured host. Optional env **`PUBLIC_BASE_URL`** (no trailing slash) overrides the absolute `url` when behind a proxy. Files in `uploads/` are gitignored.
- `POST /api/tenants/assistant/chat` — **tenant** JWT only; JSON `{ message }` (trimmed, 1–2000 chars). Returns `{ reply }` with short, conversational guidance (dashboard areas like Upcoming rent, Alerts, maintenance) rather than raw API listings.
- `GET /api/tenants/notifications` — **tenant** JWT only; returns in-app notifications (newest first), including rent renewal notices and **maintenance status updates** when a manager changes request status (`PATCH /api/managers/maintenance-requests/:id`).
- `GET /api/tenants/upcoming-rent` — **tenant** JWT only; returns `{ monthlyRentDisplay, effectiveDate, source }` for the **Upcoming rent** card: latest delivered rent renewal with structured amount/date when stored, otherwise `rentAmount` from `tenant_profiles`, otherwise empty placeholders.
- `GET /api/tenants/profile` — **tenant** JWT only; returns `{ unitNumber, propertyAssigned, fullName }` (`fullName` from `users.full_name` for initials; unit/property from `tenant_profiles` / manager onboarding via `POST /api/managers/tenants`).
- `GET /api/tenants/service-charges` — **tenant** JWT only; returns `{ propertyName, lines }` where **`lines`** are `{ id, label, amount, sortOrder }[]` for the **`properties`** row that matches your `profile.propertyAssigned` (same name match as occupancy; oldest property wins if duplicates). Empty **`lines`** until your manager saves fees. Requires migration `1762000000000-CreateServiceChargeLines`.
- `GET /api/managers/portfolio-summary` — **property manager** JWT only; returns `{ accountName, propertyCount }` from `users.full_name` and a count of **`properties`** rows for `manager_user_id` = JWT `sub` (signup property list).
- `GET /api/managers/properties` — **property manager** JWT only; returns `{ properties: [...] }` with full rows (`id`, `name`, optional `addressLine`, `city`, `stateRegion`, `postalCode`, `country`, `createdAt`), sorted by `name`. Requires migration `1761600000000-AddPropertyAddressColumns` for address columns.
- `POST /api/managers/properties` — **property manager** JWT only; JSON body `CreatePropertyDto` (`name` required; optional `addressLine`, `city`, `stateRegion`, `postalCode`, `country`). Returns `{ property }`. Duplicate name (same manager, case-insensitive trim) → **409**.
- `PATCH /api/managers/properties/:propertyId` — **property manager** JWT only; JSON `UpdatePropertyDto` (all fields optional). Returns `{ property }`. Wrong manager or unknown id → **404**.
- `DELETE /api/managers/properties/:propertyId` — **property manager** JWT only; **204** on success. Wrong manager or unknown id → **404**.
- `GET /api/managers/properties/:propertyId/service-charges` — **property manager** JWT only; returns `{ lines: [{ id, label, amount, sortOrder }] }` for that portfolio property (**404** if not yours).
- `PUT /api/managers/properties/:propertyId/service-charges` — **property manager** JWT only; JSON `{ lines: [{ label, amount }] }` (max **40** lines; `label` 1–200 chars; `amount` ≥ 0, ≤ 2 decimal places). Replaces all rows for the property; tenants with that **property name** on file see them on **`GET /api/tenants/service-charges`**. Omit blank rows; send `{ lines: [] }` to clear.
- `GET /api/managers/tenants` — **property manager** JWT only; paginated directory (`page`, `limit`, optional `search`, `property`). **Only includes tenants** whose `tenant_profiles.profile_data->>'propertyAssigned'` (trimmed, compared case-insensitively) **matches one of your `properties` names** from signup (`properties.manager_user_id` = JWT `sub`). Managers with no properties see an empty list.
- `GET /api/managers/tenants/:id` — **property manager** JWT only; full tenant user + `profile` JSON **for the same scoped tenants** as the list (otherwise **404**).
- `PATCH /api/managers/tenants/:id` — **property manager** JWT only; JSON `{ name, email, profile }` (each field optional at validation level; the UI sends all three). Updates `users.full_name` / `users.email` when provided (email must remain unique). Merges `profile` keys into `tenant_profiles.profile_data` (empty string removes that key). **After merge, `propertyAssigned` must still match one of your properties.** Same **404** if the tenant is not on your roster.
- `POST /api/managers/tenants` — **property manager** JWT; creates or updates a tenant (`CreateTenantDto`); **`profile.propertyAssigned` is required** and must match a **`properties`** row for the authenticated manager (same rules as PATCH).
- `PATCH /api/tenants/notifications/:id/read` — **tenant** JWT only; marks one notification as read.
- `GET /api/managers/tenant-notifications/property-broadcasts` — **property manager** JWT only; returns your recent **portfolio-wide** notices (`headline`, `body`, `tenantCount`, `createdAt`), newest first (max 50). Requires migration `CreatePropertyBroadcasts1761400000000`.
- `POST /api/managers/tenant-notifications/property-broadcast` — **property manager** JWT only; JSON `{ headline, body }` (headline 3–280 chars, body 1–4000). Creates one **broadcast** record and one **tenant** notification per **tenant** account (`kind: property_broadcast`). Emits **`notifications:updated`** to each tenant on **`/tenants/notifications`**. Capped at **500** tenants per send.
- `POST /api/managers/tenant-notifications/rent-renewal` — **property manager** JWT only; JSON `{ noticeBody, headline?, renewalMonthlyRentDisplay?, renewalEffectiveDate?, tenantEmail?, tenantEmails? }`. Provide **at least one** recipient with **`tenantEmail`** (legacy string) and/or **`tenantEmails`** (array); values are merged and deduped (max **25**). Each address must match an existing **`role: tenant`** account. Returns **`{ delivered, failed }`**; when exactly one recipient succeeds with no failures, **`id`**, **`tenantId`**, **`emailSent`**, **`emailSkipped`** are also returned for backward compatibility. The manager UI can populate choices from **`GET /api/managers/tenants`** (`search`, `limit` ≤ 50). Requires migrations `CreateTenantNotificationsTable1761200000000` and `AddRenewalSummaryColumnsToTenantNotifications1761300000000`. Emits **`notifications:updated`** per tenant on **`/tenants/notifications`**.
- `GET /api/managers/maintenance-requests` — **property manager** JWT only; lists tenant-submitted maintenance **only for tenants on your occupancy roster** (same scope as `GET /api/managers/tenants`), newest first, including tenant name and email for triage.
- `PATCH /api/managers/maintenance-requests/:id` — **property manager** JWT only; JSON `{ status }` where `status` is `submitted` | `reviewing` | `in_progress` | `resolved`. **404** if the request’s tenant is not on your roster (same rules as tenant detail). When the status **changes**, emits **`maintenance:updated`** with `{ id }` on **`/tenants/notifications`** so tenant apps can refetch the maintenance list immediately; then creates a tenant in-app notification (`kind: maintenance_status`) and emits **`notifications:updated`** so **Alerts** refreshes.
- **WebSocket (Socket.IO)** — namespaces (same host/port as the HTTP API, e.g. `http://localhost:3001/...`):
  - **`/managers/maintenance`** — connect with a **property manager** JWT in `handshake.auth.token` (or query `token`). Server joins the client to a **per-manager room** (`manager:<JWT sub>`) and emits **`maintenance:created`** with `{ id: string }` when a tenant on that manager’s occupancy roster creates a request.
  - **`/tenants/notifications`** — connect with a **tenant** JWT in `handshake.auth.token` (or query `token`). Server joins the client to a per-tenant room and emits **`notifications:updated`** (payload `{ id?: string }`) when a new in-app notification is created (e.g. rent renewal, maintenance status alert, property broadcast). Emits **`maintenance:updated`** with `{ id: string }` when a property manager changes a maintenance request status (`PATCH /api/managers/maintenance-requests/:id`) so tenant clients can refresh maintenance rows without waiting for the notification write.

End-to-end tests load `.env` via `test/load-env.ts`, so a valid `DATABASE_URL` is required for `npm run test:e2e`.

TypeORM migrations (optional):

```bash
npm run typeorm:migration:generate -- src/migrations/DescribeChange
npm run typeorm:migration:run
```

## Compile and run the project

```bash
# development (watch)
$ npm run start:dev

# run compiled app (after `npm run build`; used by Render / `npm start`)
$ npm run start
# or
$ npm run start:prod

# Nest CLI compile + run (no watch), if you need it
$ npm run start:nest
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Render

Environment variables, build/start commands, migrations, and a sample `render.yaml` (monorepo `rootDir`) are documented in **[docs/render.md](docs/render.md)**. The repo root [render.yaml](../render.yaml) defines a Web Service for this app when the Git root is the monorepo.

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
