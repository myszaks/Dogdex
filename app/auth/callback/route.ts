import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Handles Supabase auth redirects (email confirm, magic link, password reset).
 * Supabase Dashboard → Authentication → URL Configuration:
 *   Redirect URL: <your-origin>/auth/callback
 *
 * For password recovery the flow is:
 *   Email link → /auth/callback?code=XXX&next=/reset-password
 *
 * IMPORTANT: cookies must be set directly on the redirect Response,
 * not via next/headers — otherwise the session is lost on redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    // Create the redirect response first so we can attach cookies to it
    const redirectResponse = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Set cookies directly on the redirect response
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return redirectResponse
    }
  }

  // On failure redirect to home with an error hint
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`)
}
