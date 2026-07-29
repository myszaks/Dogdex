import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SPEEDWAY_FORMAT } from '@/lib/competitionPresets'

const createAuthClient = vi.fn()
const checkRoleForApi = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
}))

function queryReturning<T>(data: T) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function queryList<T>(data: T) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    then: (
      resolve: (value: { data: T; error: null }) => unknown,
    ) => Promise.resolve(resolve({ data, error: null })),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('POST /api/events/[id]/competition-results', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('keeps the Speedway check-in gate when results use the configurable engine', async () => {
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })

    const eventQuery = queryReturning({
      id: 'event-1',
      created_by: 'organizer-1',
      status: 'ongoing',
      event_type_id: 'speedway',
      competition_config: SPEEDWAY_FORMAT,
      competition_values: { distance_m: 50 },
      competition_config_revision: 1,
    })
    const registrationQuery = queryReturning({
      id: 'registration-1',
      checked_in: false,
    })
    const from = vi.fn((table: string) => {
      if (table === 'events') return eventQuery
      if (table === 'registrations') return registrationQuery
      throw new Error(`Unexpected table ${table}`)
    })
    createAuthClient.mockResolvedValue({ from })

    const { POST } = await import('@/app/api/events/[id]/competition-results/route')
    const response = await POST(new Request('http://localhost/api/events/event-1/competition-results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        participantId: 'dog-1',
        stageId: 'main',
        attemptId: 'run_1',
        status: null,
        values: { time_ms: 5000 },
      }),
    }), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Najpierw odpraw psa. Nieodprawione psy nie trafiają do wyników Speedway.',
    })
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('accepts live Speedway data and recalculates the public result snapshot', async () => {
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })

    const eventQuery = queryReturning({
      id: 'event-1',
      created_by: 'organizer-1',
      status: 'ongoing',
      event_type_id: 'speedway',
      competition_config: SPEEDWAY_FORMAT,
      competition_values: { distance_m: 50 },
      competition_config_revision: 1,
    })
    const registrationCheck = queryReturning({
      id: 'registration-1',
      checked_in: true,
    })
    const registrations = [{
      id: 'registration-1',
      participant_id: 'dog-1',
      form_data: { height_cm: 25, sport_class: 'true' },
      checked_in: true,
      participants: {
        id: 'dog-1',
        dog_name: 'Figa',
        owner_name: 'Anna',
        dogs: { height_cm: 25 },
      },
    }]
    const registrationList = queryList(registrations)
    const existingEntry = queryReturning(null)
    const entries = [{
      participant_id: 'dog-1',
      stage_id: 'main',
      attempt_id: 'run_1',
      status: null,
      values: { time_ms: 5000 },
      revision: 1,
    }]
    const entryList = queryList(entries)
    const savedEntry = {
      id: 'entry-1',
      event_id: 'event-1',
      participant_id: 'dog-1',
      stage_id: 'main',
      attempt_id: 'run_1',
      status: null,
      values: { time_ms: 5000 },
      revision: 1,
    }
    const insert = vi.fn(() => ({
      select: () => ({
        single: vi.fn(async () => ({ data: savedEntry, error: null })),
      }),
    }))
    const calculatedUpsert = vi.fn(async () => ({ error: null }))

    let registrationsCall = 0
    let entriesCall = 0
    const from = vi.fn((table: string) => {
      if (table === 'events') return eventQuery
      if (table === 'registrations') {
        registrationsCall += 1
        return registrationsCall === 1 ? registrationCheck : registrationList
      }
      if (table === 'competition_result_entries') {
        entriesCall += 1
        if (entriesCall === 1) return existingEntry
        if (entriesCall === 2) return { insert }
        return entryList
      }
      if (table === 'competition_calculated_results') {
        return { upsert: calculatedUpsert }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createAuthClient.mockResolvedValue({ from })

    const { POST } = await import('@/app/api/events/[id]/competition-results/route')
    const response = await POST(new Request('http://localhost/api/events/event-1/competition-results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        participantId: 'dog-1',
        stageId: 'main',
        attemptId: 'run_1',
        status: null,
        values: { time_ms: 5000 },
      }),
    }), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(201)
    expect(calculatedUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        event_id: 'event-1',
        participant_id: 'dog-1',
        computed: expect.objectContaining({
          best_time_ms: 5000,
          speed_kmh: 36,
          __completed: false,
        }),
        groups: { size_class: 'sport' },
        ranks: { class: 1 },
      }),
    ], { onConflict: 'event_id,participant_id' })
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      recalculated: 1,
      result: expect.objectContaining({
        participantId: 'dog-1',
        ranks: { class: 1 },
      }),
    }))
  })
})
