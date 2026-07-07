import { createServerClient as createSSRClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Service-role client - bypasses RLS. Use only for admin server operations.
 * NEVER expose the service role key to the browser.
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function hasServiceRoleKey() {
  return typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string'
    && process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0
}

/**
 * Auth-aware server client - reads the user's session from cookies.
 * Use in Server Components, Server Actions and API Route Handlers.
 */
export async function createAuthClient() {
  const cookieStore = await cookies()
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return (cookieStore as any).getAll?.() ?? [] },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              (cookieStore as any).set?.(name, value, options)
            )
          } catch {
            // Server Components cannot set cookies - middleware handles refresh
          }
        },
      },
    }
  )
}
