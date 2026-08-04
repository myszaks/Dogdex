import { NextResponse } from 'next/server'
import { hasSharedEventAccess } from '@/lib/eventAccess'
import { getServerUser } from '@/lib/getServerUser'

export async function GET() {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ hasEventManagement: false }, { status: 401 })
  return NextResponse.json({ hasEventManagement: await hasSharedEventAccess() })
}
