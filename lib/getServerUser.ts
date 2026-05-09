import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createAuthClient } from './supabaseServer'

export async function getServerUser() {
  const supabase = await createAuthClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, role: null }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role: string = (profile as any)?.role ?? 'user'
    return { user, role }
  } catch {
    return { user: null, role: null }
  }
}

export async function requireRole(roles: string[]) {
  const { user, role } = await getServerUser()
  if (!user) redirect('/')
  if (role !== 'admin' && (!role || !roles.includes(role))) redirect('/')
  return { user: user!, role: role! }
}

/** Use this in API Route Handlers instead of requireRole (which uses redirect). */
export async function checkRoleForApi(
  roles: string[]
): Promise<{ error: NextResponse } | { user: NonNullable<Awaited<ReturnType<typeof getServerUser>>['user']>; role: string }> {
  const { user, role } = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 }) }
  if (role !== 'admin' && (!role || !roles.includes(role))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user: user!, role: role! }
}

/** @deprecated cookies are now read automatically via @supabase/ssr */
export async function extractTokenFromCookies(): Promise<string | null> {
  return null
}
