import { createAuthClient } from '@/lib/supabaseServer'
import AuthGateClient from './AuthGateClient'

/**
 * AuthGate — server component.
 * When ALLOWLIST_ENABLED=1, only users whose email is in ALLOWED_EMAILS
 * can see the app. Others see a full-screen login prompt (unauthenticated)
 * or a 403 message (authenticated but not in the list).
 *
 * Runs on every RSC render, including client-side navigations — so it
 * cannot be bypassed by navigating around the app.
 */
export default async function AuthGate({ children }: { children: React.ReactNode }) {
  const enabled =
    process.env.ALLOWLIST_ENABLED === '1' ||
    process.env.ALLOWLIST_ENABLED === 'true'

  if (!enabled) return <>{children}</>

  const supabase = await createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Not logged in → show login-only screen (client component handles modal)
  if (!user) {
    return <AuthGateClient state="unauthenticated" />
  }

  // Logged in but not in allowlist → show 403
  const raw = process.env.ALLOWED_EMAILS ?? ''
  const allowed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const email = (user.email ?? '').toLowerCase()
  if (!allowed.includes(email)) {
    return <AuthGateClient state="forbidden" email={email} />
  }

  return <>{children}</>
}
