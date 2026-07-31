import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
}))

vi.mock('@/lib/getServerUser', () => ({ getServerUser: mocks.getServerUser }))
vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))

describe('POST /api/training-reviews', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('requires authentication', async () => {
    mocks.getServerUser.mockResolvedValue({ user: null, role: null })
    const { POST } = await import('@/app/api/training-reviews/route')
    const response = await POST(new Request('https://dogdex.test/api/training-reviews', {
      method: 'POST',
      body: JSON.stringify({ booking_id: 'booking-1', rating: 5 }),
    }))
    expect(response.status).toBe(401)
  })

  it('validates rating before touching the database', async () => {
    mocks.getServerUser.mockResolvedValue({ user: { id: 'user-1', user_metadata: {} }, role: 'user' })
    const { POST } = await import('@/app/api/training-reviews/route')
    const response = await POST(new Request('https://dogdex.test/api/training-reviews', {
      method: 'POST',
      body: JSON.stringify({ booking_id: 'booking-1', rating: 6 }),
    }))
    expect(response.status).toBe(400)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })
})
