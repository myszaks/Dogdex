import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClient = vi.fn()
const createAuthClient = vi.fn()
const getServerUser = vi.fn()
const checkRoleForApi = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServiceRoleClient,
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser,
  checkRoleForApi,
}))

function serviceClient({
  event,
  results = [],
}: {
  event: Record<string, unknown> | null
  results?: Array<Record<string, unknown>>
}) {
  const resultSelect = vi.fn((_columns: string) => ({
    eq: vi.fn(() => ({
      order: vi.fn(async () => ({ data: results, error: null })),
    })),
  }))

  return {
    resultSelect,
    client: {
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: event, error: null })),
              })),
            })),
          }
        }
        if (table === 'results') return { select: resultSelect }
        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
}

describe('GET /api/results', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getServerUser.mockResolvedValue({ user: null, role: null })
  })

  it('requires an event id instead of exposing every result', async () => {
    const { GET } = await import('@/app/api/results/route')
    const response = await GET(new Request('http://localhost/api/results'))

    expect(response.status).toBe(400)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('returns only explicitly public event results through the server client', async () => {
    const fixture = serviceClient({
      event: {
        id: 'event-1',
        status: 'ongoing',
        results_public: true,
        created_by: 'organizer-1',
      },
      results: [{ id: 'result-1', participant_id: 'participant-1' }],
    })
    createServiceRoleClient.mockReturnValue(fixture.client)

    const { GET } = await import('@/app/api/results/route')
    const response = await GET(new Request('http://localhost/api/results?eventId=event-1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      { id: 'result-1', participant_id: 'participant-1' },
    ])
    const selectedColumns = fixture.resultSelect.mock.calls[0]?.[0]
    expect(selectedColumns).toContain('participants(dog_name, owner_name, dog_breed)')
    expect(selectedColumns).not.toContain('owner_email')
  })

  it('hides non-public results from anonymous users', async () => {
    const fixture = serviceClient({
      event: {
        id: 'event-1',
        status: 'ongoing',
        results_public: false,
        created_by: 'organizer-1',
      },
    })
    createServiceRoleClient.mockReturnValue(fixture.client)

    const { GET } = await import('@/app/api/results/route')
    const response = await GET(new Request('http://localhost/api/results?eventId=event-1'))

    expect(response.status).toBe(404)
    expect(fixture.resultSelect).not.toHaveBeenCalled()
  })

  it('allows the event owner to read private results', async () => {
    const fixture = serviceClient({
      event: {
        id: 'event-1',
        status: 'ongoing',
        results_public: false,
        created_by: 'organizer-1',
      },
    })
    createServiceRoleClient.mockReturnValue(fixture.client)
    getServerUser.mockResolvedValue({ user: { id: 'organizer-1' }, role: 'organizer' })

    const { GET } = await import('@/app/api/results/route')
    const response = await GET(new Request('http://localhost/api/results?eventId=event-1'))

    expect(response.status).toBe(200)
  })
})

describe('POST /api/results', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })
  })

  it('rejects an organizer who does not own the event', async () => {
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'events') throw new Error(`Unexpected table ${table}`)
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { created_by: 'organizer-2', track_distance_m: 50 },
                error: null,
              }),
            }),
          }),
        }
      }),
    })

    const { POST } = await import('@/app/api/results/route')
    const response = await POST(new Request('http://localhost/api/results', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'event-1', participantId: 'participant-1' }),
    }))

    expect(response.status).toBe(403)
  })

  it('uses the event distance from the database and requires a confirmed registration', async () => {
    const insert = vi.fn((rows: Array<Record<string, unknown>>) => ({
      select: () => ({
        single: async () => ({ data: rows[0], error: null }),
      }),
    }))

    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { created_by: 'organizer-1', track_distance_m: 50 },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'registrations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { id: 'registration-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'results') return { insert }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/results/route')
    const response = await POST(new Request('http://localhost/api/results', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        participantId: 'participant-1',
        run1_ms: 5000,
        size_class: 'M',
        track_distance_m: 999,
      }),
    }))

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        event_id: 'event-1',
        participant_id: 'participant-1',
        best_ms: 5000,
        speed_kmh: 36,
      }),
    ])
  })
})
