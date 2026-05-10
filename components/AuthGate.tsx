import { createAuthClient } from '@/lib/supabaseServer'
import { headers } from 'next/headers'
import AuthGateClient from './AuthGateClient'

/**
 * AuthGate — server component.
 * When ALLOWLIST_ENABLED=1, only users whose email is in ALLOWED_EMAILS
 * can see the app. Others see a full-screen login prompt (unauthenticated)
 * or a 403 message (authenticated but not in the list).
 *
 * Public paths (e.g. /register/..., /events/...) are excluded so that
 * event participants can still sign up without an account.
 */

// Paths that are always accessible regardless of ALLOWLIST
const PUBLIC_PREFIXES = ['/register/', '/events/', '/auth/', '/archive/']

export default async function AuthGate({ children }: { children: React.ReactNode }) {
  const enabled =
    process.env.ALLOWLIST_ENABLED === '1' ||
    process.env.ALLOWLIST_ENABLED === 'true'

  if (!enabled) return <>{children}</>

  // Skip gate for public paths (event registration, event detail, auth callbacks)
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? headersList.get('next-url') ?? ''
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return <>{children}</>
  }

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
