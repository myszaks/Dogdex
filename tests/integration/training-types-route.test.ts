import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const getServerUser = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser,
  canManageTrainerResource: (
    userId: string,
    trainerId: string,
    role: string | null,
  ) => role === 'admin' || (role === 'trainer' && userId === trainerId),
}))

describe('training type routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getServerUser.mockResolvedValue({
      user: { id: 'trainer-1' },
      role: 'trainer',
    })
  })

  it('lists only active offers owned by the signed-in trainer', async () => {
    const eq = vi.fn()
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const query = {
      select: vi.fn(),
      eq,
      order,
    }
    query.select.mockReturnValue(query)
    eq.mockReturnValue(query)
    createAuthClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
    })

    const { GET } = await import('@/app/api/training-types/route')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('trainer_id', 'trainer-1')
    expect(eq).toHaveBeenCalledWith('is_active', true)
  })

  it('soft-deactivates an offer instead of deleting booking history', async () => {
    const update = vi.fn()
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const selectSingle = vi.fn().mockResolvedValue({
      data: { trainer_id: 'trainer-1' },
      error: null,
    })

    createAuthClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            single: selectSingle,
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          update(payload)
          return { eq: updateEq }
        },
      }),
    })

    const { DELETE } = await import('@/app/api/training-types/[id]/route')
    const response = await DELETE(
      new Request('https://dogdex.test/api/training-types/type-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'type-1' }) },
    )

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }))
    expect(updateEq).toHaveBeenCalledWith('id', 'type-1')
  })

  it('rejects updates to another trainer offer', async () => {
    createAuthClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { trainer_id: 'trainer-2' },
              error: null,
            }),
          }),
        }),
      }),
    })

    const { PATCH } = await import('@/app/api/training-types/[id]/route')
    const response = await PATCH(
      new Request('https://dogdex.test/api/training-types/type-2', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Cudza oferta' }),
      }),
      { params: Promise.resolve({ id: 'type-2' }) },
    )

    expect(response.status).toBe(403)
  })
})
