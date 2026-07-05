import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createAuthClient } from './supabaseServer'
import { hasRequiredRole, isTrainerRole } from './roles'

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

    const role: string = (profile as { role: string } | null)?.role ?? 'user'
    return { user, role }
  } catch {
    return { user: null, role: null }
  }
}

export async function requireRole(roles: string[]) {
  const { user, role } = await getServerUser()
  if (!user) redirect('/')
  if (!hasRequiredRole(role, roles)) redirect('/')
  return { user: user!, role: role! }
}

/** Use this in API Route Handlers instead of requireRole (which uses redirect). */
export async function checkRoleForApi(
  roles: string[]
): Promise<{ error: NextResponse } | { user: NonNullable<Awaited<ReturnType<typeof getServerUser>>['user']>; role: string }> {
  const { user, role } = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 }) }
  if (!hasRequiredRole(role, roles)) {
    return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 }) }
  }
  return { user: user!, role: role! }
}

/**
 * Helper: Check if user can manage a trainer resource (training types, availability, etc.)
 * User can manage if they own it and have a trainer role, or they are admin.
 */
export function canManageTrainerResource(userId: string, trainerId: string, userRole: string | null): boolean {
  return userRole === 'admin' || (userId === trainerId && isTrainerRole(userRole))
}


