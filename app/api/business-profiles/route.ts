import { NextResponse } from 'next/server'
import { getBusinessProfileAccess, listBusinessProfileOptions } from '@/lib/businessAccess'

export async function GET() {
  const [profiles, active] = await Promise.all([listBusinessProfileOptions(), getBusinessProfileAccess()])
  return NextResponse.json({ profiles, activeProfileId: active?.profile.id ?? null })
}
