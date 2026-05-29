# Supabase `DATABASE_URL` (Postgres)

## `ENETUNREACH` / IPv6 (`2a05:...:5432`)

The DB hostname often has both **A** and **AAAA** records. `node-postgres` connects with `net.connect(port, host)` in an order that can pick **IPv6** first; many networks have no working IPv6 route, so you see `ENETUNREACH`.

The backend **resolves the hostname to an IPv4 address** (`dns.lookupSync(..., { family: 4 })`), connects to that IP, and sets TLS **`servername`** to the original hostname so the Supabase certificate still matches.

To skip that and use the URL hostname as-is:

```env
DATABASE_RESOLVE_IPV4=false
```

If it still fails, confirm outbound **5432** (or **6543** for the pooler) is allowed, or try the **pooler** URI from the Supabase dashboard.

## “Database does not exist” / “database not found”

Postgres picks the **database name from the path** in the URI. If you omit it, it uses your **username** as the database name.

With Supabase **pooling**, the username is often `postgres.<project-ref>`. Without `/postgres` in the URL, the server looks for a database literally named `postgres.xxxxx` and fails.

**Fix:** always include **`/postgres`** before any `?` query string.

Good:

```text
postgresql://postgres.abcdefghij:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Bad (missing database path):

```text
postgresql://postgres.abcdefghij:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543?pgbouncer=true
```

## Where to copy the string

1. Supabase Dashboard → your project → **Project Settings** (gear) → **Database**.
2. Under **Connection string**, choose **URI**.
3. Use **Transaction pooler** (or **Session pooler**) for server apps; **Direct connection** is fine for local tools.
4. Replace `[YOUR-PASSWORD]` with the real database password (not the anon/service API keys).

## Password special characters

If the password contains `@`, `#`, `%`, spaces, etc., it must be **URL-encoded** inside the URI (e.g. `@` → `%40`). Supabase’s “copy” UI usually gives you a placeholder; paste your encoded password.

## Checklist

- [ ] URI starts with `postgresql://` or `postgres://`
- [ ] Path ends with **`/postgres`** (before `?`)
- [ ] Pooler URL on port **6543** includes **`?pgbouncer=true`** when Supabase documents it for transaction mode
- [ ] `.env` file lives in **`real_estate_backend/`** (same folder as `package.json`), not only in the repo root
