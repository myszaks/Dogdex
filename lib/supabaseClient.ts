import { createBrowserClient } from '@supabase/ssr'

let _supabase: ReturnType<typeof createBrowserClient> | null = null

export function getSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are not configured')
  }
  
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  }
  return _supabase
}

// For backwards compatibility - lazy getter
export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_, prop) {
    return (getSupabase() as any)[prop]
  }
})
