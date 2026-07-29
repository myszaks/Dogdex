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
})
