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

  it('updates only the authenticated user safe profile fields', async () => {
    const single = vi.fn(async () => ({
      data: {
        id: 'user-1',
        full_name: 'Anna Kowalska',
        company: 'Dog Club',
        role: 'user',
        event_creator_tutorial_seen_at: null,
      },
      error: null,
    }))
    const select = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))

    createAuthClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
        })),
      },
      from: vi.fn(() => ({ update })),
    })

    const { PATCH } = await import('@/app/api/profile/route')
    const response = await PATCH(new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: '  Anna Kowalska  ',
        company: '  Dog Club  ',
        role: 'admin',
      }),
    }))

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith({
      full_name: 'Anna Kowalska',
      company: 'Dog Club',
    })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('does not expose database errors to the user', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const single = vi.fn(async () => ({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table profiles',
      },
    }))
    const select = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))

    createAuthClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
        })),
      },
      from: vi.fn(() => ({ update })),
    })

    const { PATCH } = await import('@/app/api/profile/route')
    const response = await PATCH(new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: 'Anna' }),
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Nie udało się zapisać zmian. Spróbuj ponownie.',
    })
  })
})
