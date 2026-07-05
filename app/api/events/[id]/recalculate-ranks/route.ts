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

  const { data: event } = await supabase
    .from('events')
    .select('created_by, status, event_type_id')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }
  if (event.status === 'finished' || event.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Zawody są zakończone. Rankingi są zablokowane.' },
      { status: 409 },
    )
  }

  // Pobierz wszystkie wyniki dla tego wydarzenia
  const { data: allResults, error } = await supabase
    .from('results')
    .select('id, participant_id, size_class, best_ms')
    .eq('event_id', eventId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!allResults?.length) return NextResponse.json([])

  let results = allResults
  const inactiveUpdates: { id: string }[] = []

  if (event.event_type_id === 'speedway') {
    const { data: checkedInRegistrations, error: checkedInError } = await supabase
      .from('registrations')
      .select('participant_id')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .eq('checked_in', true)

    if (checkedInError) return NextResponse.json({ error: checkedInError.message }, { status: 500 })

    const checkedInParticipantIds = new Set(
      (checkedInRegistrations ?? []).map(reg => reg.participant_id as string)
    )

    results = allResults.filter(r => checkedInParticipantIds.has(r.participant_id as string))
    inactiveUpdates.push(
      ...allResults
        .filter(r => !checkedInParticipantIds.has(r.participant_id as string))
        .map(r => ({ id: r.id as string }))
    )
  }

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
  const updatePromises = [
    ...updates.map(({ id, class_rank }) =>
      supabase
        .from('results')
        .update({ class_rank: class_rank === 0 ? null : class_rank })
        .eq('id', id)
    ),
    ...inactiveUpdates.map(({ id }) =>
      supabase
        .from('results')
        .update({ class_rank: null })
        .eq('id', id)
    ),
  ]

  await Promise.all(updatePromises)

  return NextResponse.json({
    ok: true,
    updated: updates.filter(u => u.class_rank !== 0).length,
  })
}
