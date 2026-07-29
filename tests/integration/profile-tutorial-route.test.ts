import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
}))

describe('PATCH /api/profile tutorial preference', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('marks the creator tutorial as seen only on the authenticated profile', async () => {
    const update = vi.fn()
    const eq = vi.fn()
    const select = vi.fn()
    const single = vi.fn(async () => ({
      data: {
        id: 'organizer-1',
        event_creator_tutorial_seen_at: '2026-07-29T15:00:00.000Z',
      },
      error: null,
    }))

    update.mockReturnValue({ eq })
    eq.mockReturnValue({ select })
    select.mockReturnValue({ single })
    createAuthClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'organizer-1' } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table !== 'profiles') throw new Error(`Unexpected table ${table}`)
        return { update }
      }),
    })

    const { PATCH } = await import('@/app/api/profile/route')
    const response = await PATCH(new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_creator_tutorial_seen: true }),
    }))

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith({
      event_creator_tutorial_seen_at: expect.any(String),
    })
    expect(eq).toHaveBeenCalledWith('id', 'organizer-1')
  })
})
