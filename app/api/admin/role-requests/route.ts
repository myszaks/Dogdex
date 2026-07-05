import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import {
  isRoleRequestStatus,
  nextRoleAfterApproval,
} from '@/lib/roles'

export async function GET() {
  const auth = await checkRoleForApi(['admin'])
  if ('error' in auth) return auth.error

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('role_upgrade_requests')
    .select('*, profiles:profiles!role_upgrade_requests_user_id_fkey(id, full_name, company, role)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requests = await Promise.all(
    (data ?? []).map(async (request: any) => {
      const { data: authUser } = await supabase.auth.admin.getUserById(request.user_id)
      return {
        ...request,
        user_email: authUser.user?.email ?? null,
      }
    }),
  )

  return NextResponse.json(requests)
}

export async function PATCH(req: Request) {
  const auth = await checkRoleForApi(['admin'])
  if ('error' in auth) return auth.error

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const status = body.status
  const adminNotes = typeof body.admin_notes === 'string'
    ? body.admin_notes.trim().slice(0, 2000)
    : typeof body.adminNotes === 'string'
      ? body.adminNotes.trim().slice(0, 2000)
      : null
  const rejectionReason = typeof body.rejection_reason === 'string'
    ? body.rejection_reason.trim().slice(0, 2000)
    : typeof body.rejectionReason === 'string'
      ? body.rejectionReason.trim().slice(0, 2000)
      : null

  if (!id) return NextResponse.json({ error: 'Brakuje ID wniosku' }, { status: 400 })
  if (!isRoleRequestStatus(status) || status === 'pending') {
    return NextResponse.json({ error: 'Nieprawidłowy status decyzji' }, { status: 400 })
  }
  if (status === 'rejected' && !rejectionReason) {
    return NextResponse.json({ error: 'Podaj powód odrzucenia.' }, { status: 400 })
  }
  if (status === 'needs_info' && !adminNotes) {
    return NextResponse.json({ error: 'Napisz, jakie informacje użytkownik ma uzupełnić.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: request, error: fetchError } = await supabase
    .from('role_upgrade_requests')
    .select('*, profiles:profiles!role_upgrade_requests_user_id_fkey(id, role)')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!request) return NextResponse.json({ error: 'Nie znaleziono wniosku' }, { status: 404 })
  if (request.status === 'approved' || request.status === 'rejected') {
    return NextResponse.json({ error: 'Ten wniosek jest już zamknięty.' }, { status: 409 })
  }

  if (status === 'approved') {
    const currentRole = typeof request.profiles?.role === 'string' ? request.profiles.role : 'user'
    const nextRole = nextRoleAfterApproval(currentRole, request.requested_role)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', request.user_id)

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('role_upgrade_requests')
    .update({
      status,
      admin_notes: adminNotes || null,
      rejection_reason: status === 'rejected' ? rejectionReason : null,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, profiles:profiles!role_upgrade_requests_user_id_fkey(id, full_name, company, role)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/admin/role-requests')
  revalidatePath('/profile')

  return NextResponse.json(data)
}
