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

describe('POST /api/events/[id]/competition-live-state', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })
  })

  it('moves the public live cursor to a confirmed participant', async () => {
    const eventQuery = queryReturning({
      created_by: 'organizer-1',
      status: 'ongoing',
      competition_config: SPEEDWAY_FORMAT,
    })
    const registrationQuery = queryReturning({ id: 'registration-2' })
    const single = vi.fn(async () => ({
      data: {
        event_id: 'event-1',
        current_participant_id: 'dog-2',
        cursor: 1,
      },
      error: null,
    }))
    const upsert = vi.fn(() => ({
      select: () => ({ single }),
    }))
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') return eventQuery
        if (table === 'registrations') return registrationQuery
        if (table === 'competition_live_state') return { upsert }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/events/[id]/competition-live-state/route')
    const response = await POST(new Request('http://localhost/api/events/event-1/competition-live-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentParticipantId: 'dog-2',
        cursor: 1,
        currentStageId: 'main',
        currentAttemptId: 'run_1',
      }),
    }), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'event-1',
      current_participant_id: 'dog-2',
      cursor: 1,
      current_stage_id: 'main',
      current_attempt_id: 'run_1',
      updated_by: 'organizer-1',
    }), { onConflict: 'event_id' })
  })

  it('rejects a live participant who is not confirmed for the event', async () => {
    const eventQuery = queryReturning({
      created_by: 'organizer-1',
      status: 'ongoing',
      competition_config: SPEEDWAY_FORMAT,
    })
    const registrationQuery = queryReturning(null)
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') return eventQuery
        if (table === 'registrations') return registrationQuery
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/events/[id]/competition-live-state/route')
    const response = await POST(new Request('http://localhost/api/events/event-1/competition-live-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentParticipantId: 'unknown-dog',
        cursor: 2,
      }),
    }), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(400)
  })
})
