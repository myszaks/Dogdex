import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const checkRoleForApi = vi.fn()
const requireEventAccessForApi = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
}))
vi.mock('@/lib/eventAccess', () => ({ requireEventAccessForApi }))

describe('POST /api/events/[id]/recalculate-ranks', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventAccessForApi.mockResolvedValue({ error: new Response(null, { status: 403 }) })
  })

  it('rejects organizers who do not own the event', async () => {
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })

    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { created_by: 'organizer-2' },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/events/[id]/recalculate-ranks/route')
    const response = await POST(new Request('http://localhost/api/events/event-1/recalculate-ranks', {
      method: 'POST',
    }), {
      params: Promise.resolve({ id: 'event-1' }),
    })

    expect(response.status).toBe(403)
  })
})
