import { NextResponse } from 'next/server'
import { checkRoleForApi } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import {
  calculateCompetitionResults,
  validateCompetitionFieldValues,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import type {
  CompetitionAttemptInput,
  CompetitionEntrantInput,
  CompetitionScalar,
} from '@/types/competition'
import { extractSizeClassFromRegistration } from '@/lib/speedway'
import { isParticipantCompetitionComplete } from '@/lib/competitionProgress'

interface Params {
  params: Promise<{ id: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function relatedRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : {}
  return isRecord(value) ? value : {}
}

function participantDogHeight(participant: Record<string, unknown>): unknown {
  return relatedRecord(participant.dogs).height_cm
}

export async function GET(_req: Request, { params }: Params) {
  const { id: eventId } = await params
  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('competition_calculated_results')
    .select('event_id, participant_id, computed, groups, ranks, source_revision, engine_version, recalculated_at, participants(dog_name, owner_name, dog_breed)')
    .eq('event_id', eventId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: Params) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error
  const { id: eventId } = await params
  const supabase = await createAuthClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, created_by, status, event_type_id, competition_config, competition_values, competition_config_revision')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia.' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień do wyników tego wydarzenia.' }, { status: 403 })
  }
  if (event.status === 'finished' || event.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Wyniki zakończonego lub anulowanego wydarzenia są zablokowane.' },
      { status: 409 },
    )
  }

  const formatValidation = validateCompetitionFormatDefinition(event.competition_config)
  if (!formatValidation.success) {
    return NextResponse.json(
      { error: 'Wydarzenie nie ma prawidłowej konfiguracji zawodów.', issues: formatValidation.issues },
      { status: 409 },
    )
  }
  const definition = formatValidation.data

  const participantId = typeof body.participantId === 'string' ? body.participantId : ''
  const stageId = typeof body.stageId === 'string' ? body.stageId : ''
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : ''
  const status = typeof body.status === 'string' && body.status ? body.status : null
  const values = isRecord(body.values) ? body.values : {}

  if (!participantId || !stageId || !attemptId) {
    return NextResponse.json(
      { error: 'Wymagane są participantId, stageId i attemptId.' },
      { status: 400 },
    )
  }

  const stage = definition.stages.find(candidate => candidate.id === stageId)
  if (!stage || !stage.attempts.some(attempt => attempt.id === attemptId)) {
    return NextResponse.json({ error: 'Próba nie występuje w konfiguracji zawodów.' }, { status: 400 })
  }
  if (status !== null && !definition.statuses.some(candidate => candidate.id === status)) {
    return NextResponse.json({ error: 'Nieobsługiwany status próby.' }, { status: 400 })
  }

  const valueIssues = validateCompetitionFieldValues(
    definition.resultFields,
    values,
    { requireRequired: status === null },
  )
  if (valueIssues.length > 0) {
    return NextResponse.json(
      { error: 'Wartości próby są nieprawidłowe.', issues: valueIssues },
      { status: 400 },
    )
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, checked_in')
    .eq('event_id', eventId)
    .eq('participant_id', participantId)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (registrationError) {
    return NextResponse.json({ error: registrationError.message }, { status: 500 })
  }
  if (!registration) {
    return NextResponse.json(
      { error: 'Wynik można zapisać tylko potwierdzonemu uczestnikowi wydarzenia.' },
      { status: 409 },
    )
  }
  if (event.event_type_id === 'speedway' && !registration.checked_in) {
    return NextResponse.json(
      { error: 'Najpierw odpraw psa. Nieodprawione psy nie trafiają do wyników Speedway.' },
      { status: 409 },
    )
  }

  const normalizedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value as CompetitionScalar])
  )
  const { data: existingEntry, error: existingError } = await supabase
    .from('competition_result_entries')
    .select('id, revision')
    .eq('event_id', eventId)
    .eq('participant_id', participantId)
    .eq('stage_id', stageId)
    .eq('attempt_id', attemptId)
    .maybeSingle()

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const entryPayload = {
    status,
    values: normalizedValues,
    recorded_by: authResult.user.id,
    updated_at: new Date().toISOString(),
    revision: (existingEntry?.revision ?? 0) + 1,
  }
  const entryMutation = existingEntry
    ? supabase
        .from('competition_result_entries')
        .update(entryPayload)
        .eq('id', existingEntry.id)
        .select()
        .single()
    : supabase
        .from('competition_result_entries')
        .insert([{
          event_id: eventId,
          participant_id: participantId,
          stage_id: stageId,
          attempt_id: attemptId,
          ...entryPayload,
        }])
        .select()
        .single()
  const { data: savedEntry, error: saveError } = await entryMutation

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  const [
    { data: registrations, error: registrationsError },
    { data: entries, error: entriesError },
  ] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, participant_id, form_data, checked_in, participants(*, dogs(height_cm))')
      .eq('event_id', eventId)
      .eq('status', 'confirmed'),
    supabase
      .from('competition_result_entries')
      .select('participant_id, stage_id, attempt_id, status, values, revision')
      .eq('event_id', eventId),
  ])

  if (registrationsError || entriesError) {
    return NextResponse.json(
      { error: registrationsError?.message ?? entriesError?.message },
      { status: 500 },
    )
  }

  const entriesByParticipant = new Map<string, CompetitionAttemptInput[]>()
  for (const entry of entries ?? []) {
    const current = entriesByParticipant.get(entry.participant_id as string) ?? []
    current.push({
      stageId: entry.stage_id as string,
      attemptId: entry.attempt_id as string,
      status: entry.status as string | null,
      values: isRecord(entry.values)
        ? Object.fromEntries(
            Object.entries(entry.values).map(([key, value]) => [key, value as CompetitionScalar])
          )
        : {},
    })
    entriesByParticipant.set(entry.participant_id as string, current)
  }

  const eventValues = isRecord(event.competition_values) ? event.competition_values : {}
  const entrants: CompetitionEntrantInput[] = (registrations ?? []).map(row => {
    const participant = relatedRecord(row.participants)
    const formData = isRecord(row.form_data) ? row.form_data : {}
    return {
      participantId: row.participant_id as string,
      event: eventValues,
      participant,
      registration: {
        id: row.id,
        form_data: formData,
        checked_in: Boolean(row.checked_in),
        ...(event.event_type_id === 'speedway'
          ? {
              size_class: extractSizeClassFromRegistration(
                formData,
                participantDogHeight(participant),
              ) ?? 'M',
            }
          : {}),
      },
      attempts: entriesByParticipant.get(row.participant_id as string) ?? [],
    }
  })
  const calculated = calculateCompetitionResults(definition, entrants)
  const sourceRevision = Math.max(
    Number(event.competition_config_revision) || 1,
    ...(entries ?? []).map(entry => Number(entry.revision) || 1),
  )
  const recalculatedAt = new Date().toISOString()
  const calculatedPayload = calculated.map(row => ({
    event_id: eventId,
    participant_id: row.participantId,
    computed: {
      ...row.computed,
      __completed: isParticipantCompetitionComplete(
        definition,
        entriesByParticipant.get(row.participantId) ?? [],
      ),
    },
    groups: row.groups,
    ranks: row.ranks,
    source_revision: sourceRevision,
    engine_version: 1,
    recalculated_at: recalculatedAt,
  }))

  if (calculatedPayload.length > 0) {
    const { error: calculatedError } = await supabase
      .from('competition_calculated_results')
      .upsert(calculatedPayload, { onConflict: 'event_id,participant_id' })
    if (calculatedError) {
      return NextResponse.json({ error: calculatedError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    entry: savedEntry,
    result: calculated.find(row => row.participantId === participantId) ?? null,
    recalculated: calculated.length,
  }, { status: existingEntry ? 200 : 201 })
}
