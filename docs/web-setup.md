# Web app and Supabase setup

## Configuration

The app lives in `apps/web`. Its local environment file is
`apps/web/.env.local`, not a repository-root `.env.local`. It requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are browser-safe public settings. Never put a database password, service-role
key, or administrative access token in a `NEXT_PUBLIC_` variable. Environment
files are ignored by Git. The committed `.env.example` includes the project URL
and a placeholder key.

The workspace uses Next.js 16, React 19, @supabase/ssr, and @supabase/supabase-js.
The lockfile pins resolved dependencies. Node 24.19.0 is the cloud version;
the Supabase SDK requires at least Node 22.

## Development and production

From `/workspace/evolutionmedia`:

```sh
npm ci --cache /workspace/.npm-cache
NODE_USE_ENV_PROXY=1 NEXT_TELEMETRY_DISABLED=1 npm run dev -- --port 3000
```

For a production check, stop only your own development server first:

```sh
npm run typecheck
npm run test:auth
NEXT_TELEMETRY_DISABLED=1 npm run build
NODE_USE_ENV_PROXY=1 NEXT_TELEMETRY_DISABLED=1 npm run start -- --port 3000
```

Use a local HTTP request to check that `/` returns 200 and the sign-in form.
This verifies the running app; it does not establish authenticated catalog access.
Do not assume running processes survive a cloud snapshot or a new task.
Use the existing checkout in cloud tasks; do not create a worktree unless requested.

`NODE_USE_ENV_PROXY=1` is needed in this Node 24 cloud instance for outbound
requests through the platform proxy. It is not necessary on hosts without a
proxy. The Supabase project hostname must also be allowed by environment settings.

## Apply the development migration

1. Open the SQL Editor for project `gzxsqsbgvgqxblnaiozj` (Evolution Media).
2. Review `supabase/migrations/20261008000000_initial_sound_vector.sql` together
   with `docs/schema-review.md` and run it once against the empty development
   database. It creates six tables and their read policies; it is not designed
   to be blindly rerun after a partial application.
3. Run `NODE_USE_ENV_PROXY=1 npm run check:connection`. The check verifies Auth,
   the presence of the `songs` endpoint, and an empty anonymous result. An empty
   catalog does not by itself prove RLS; the local two-user tests and hosted
   authenticated checks are separate.
4. In Supabase Authentication, create a confirmed development test user through
   the dashboard. Sign in through the app; verify that the empty catalog appears.
   Do not share the test password in chat. This initial app has sign-in/sign-out;
   self-service sign-up, password reset, and OAuth are not implemented.

The supplied publishable key permits browser-level requests subject to RLS;
it cannot create tables or apply migrations. Administrative access must be
configured securely if automated migrations are desired.

## Session handling

- A browser helper uses `createBrowserClient`.
- The server helper uses `createServerClient` and awaited Next.js cookies.
- `proxy.ts` calls `getUser()` before returning; creating the client alone does
  not refresh sessions.
- Updated cookies are copied into the request used for rendering and the response
  sent to the browser. The SSR SDK's cache-prevention headers accompany writes.
- The server page validates the user and uses that user's session for the query.
  No service-role credential bypasses catalog RLS.

`npm run test:auth` exercises the real SSR SDK against a local Auth stand-in:
anonymous requests, successful expired-session refresh, and rejected refresh
clearing cookies. It does not validate hosted tokens or create remote users.

## Vercel deployment

See [Vercel deployment instructions](vercel-deployment.md) for repository import,
workspace installation, public variables, and authenticated acceptance checks.
The application includes a Vercel configuration in `apps/web/vercel.json`.
No Vercel deployment has been created by the coding agent.
