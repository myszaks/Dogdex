import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getBusinessProfileAccess } from '@/lib/businessAccess'

export async function POST(req: Request) {
  let profileId: string | null = null
  try {
    const body = await req.json()
    profileId = typeof body.profileId === 'string' ? body.profileId : null
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }
  if (!profileId) return NextResponse.json({ error: 'Wybierz profil' }, { status: 400 })
  const access = await getBusinessProfileAccess(profileId)
  if (!access) return NextResponse.json({ error: 'Brak dostępu do profilu' }, { status: 403 })
  const store = await cookies()
  store.set('dogdex_active_business_profile', profileId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
  return NextResponse.json({ activeProfileId: profileId })
}
