Supabase Auth Gate

To restrict access to the deployed preview or production app using Supabase authentication, set the following environment variables in Vercel (or your hosting):

- `ALLOWLIST_ENABLED` = `1` to enable the gate (or `true`)
- `ALLOWED_EMAILS` = comma-separated list of allowed emails, e.g. `alice@example.com,bob@example.com`

Behavior:
- If `ALLOWLIST_ENABLED` is not set or false, the gate is disabled and the app functions normally.
- If enabled, the middleware (`proxy.ts`) will check the Supabase session cookie and look up `user.email`.
  - If no session is present, the middleware redirects to `/?auth_required=1` (frontend can show the login modal).
  - If the signed-in user's email is not in `ALLOWED_EMAILS`, the middleware returns HTTP 403 "Dostęp zablokowany".

Notes:
- Ensure your Supabase client cookie/refetch logic is configured. The repository already uses `proxy.ts` to refresh sessions and set cookies correctly for Server Components.
- On Vercel, set these env vars separately for Preview and Production environments if desired.
- To allow a new user, add their email to `ALLOWED_EMAILS` and re-deploy (or update env and redeploy/refresh).

Example (Vercel env vars):
ALLOWLIST_ENABLED=1
ALLOWED_EMAILS=alice@example.com,bob@example.com
