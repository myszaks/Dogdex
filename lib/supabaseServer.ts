import { createServerClient as createSSRClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !anonKey) {
    throw new Error('Supabase environment variables are not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  
  return { url, anonKey, serviceKey }
}

/**
 * Service-role client — bypasses RLS. Use only for admin server operations.
 * NEVER expose the service role key to the browser.
 */
export function createServerClient() {
  const { url, anonKey, serviceKey } = getSupabaseConfig()
  const key = serviceKey ?? anonKey
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/** @deprecated kept for backwards compat */
export { createServerClient as createServerClient_ServiceRole }

/**
 * Auth-aware server client — reads the user's session from cookies.
 * Use in Server Components, Server Actions and API Route Handlers.
 */
export async function createAuthClient() {
  const { url, anonKey } = getSupabaseConfig()
  const cookieStore = await cookies()
  return createSSRClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() { return (cookieStore as any).getAll?.() ?? [] },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              (cookieStore as any).set?.(name, value, options)
            )
          } catch {
            // Server Components cannot set cookies — middleware handles refresh
          }
        },
      },
    }
  )
}

/** @deprecated Use createAuthClient() instead */
export async function createServerClientForToken(_token?: string) {
  return createAuthClient()
}
