import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { SIZE_CLASSES } from '@/lib/speedway'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/events/[id]/recalculate-ranks
 *
 * Przelicza class_rank dla wszystkich wyników speedway w danym wydarzeniu.
 * Grupuje po size_class, sortuje po best_ms rosnąco, przypisuje miejsca 1, 2, 3...
 * Zwraca tablicę zaktualizowanych rekordów { id, size_class, class_rank }.
 */
export async function POST(_req: Request, { params }: Params) {
  const { id: eventId } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  // Pobierz wszystkie wyniki dla tego wydarzenia
  const { data: results, error } = await supabase
    .from('results')
    .select('id, size_class, best_ms')
    .eq('event_id', eventId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!results?.length) return NextResponse.json([])

  // Grupuj po klasie i sortuj po best_ms
  const updates: { id: string; class_rank: number }[] = []

  for (const cls of SIZE_CLASSES) {
    const inClass = results
      .filter(r => r.size_class === cls && r.best_ms !== null)
      .sort((a, b) => (a.best_ms as number) - (b.best_ms as number))

    inClass.forEach((r, idx) => {
      updates.push({ id: r.id, class_rank: idx + 1 })
    })

    // Uczestnicy bez best_ms w tej klasie → class_rank = null
    const noTime = results.filter(r => r.size_class === cls && r.best_ms === null)
    noTime.forEach(r => updates.push({ id: r.id, class_rank: 0 })) // 0 = brak czasu marker
  }

  // Batch update — równolegle
  const updatePromises = updates.map(({ id, class_rank }) =>
    supabase
      .from('results')
      .update({ class_rank: class_rank === 0 ? null : class_rank })
      .eq('id', id)
  )

  await Promise.all(updatePromises)

  return NextResponse.json({
    ok: true,
    updated: updates.filter(u => u.class_rank !== 0).length,
  })
}
