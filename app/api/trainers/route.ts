import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = await createAuthClient()

  // Get all active trainer profiles
  const { data: trainers, error } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(trainers)
}
