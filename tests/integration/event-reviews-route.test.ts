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

describe('POST /api/event-reviews', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('requires authentication', async () => {
    mocks.getServerUser.mockResolvedValue({ user: null, role: null })
    const { POST } = await import('@/app/api/event-reviews/route')
    const response = await POST(new Request('https://dogdex.test/api/event-reviews', {
      method: 'POST',
      body: JSON.stringify({ event_id: 'event-1', rating: 5 }),
    }))
    expect(response.status).toBe(401)
  })

  it('validates rating before reading event data', async () => {
    mocks.getServerUser.mockResolvedValue({ user: { id: 'user-1', user_metadata: {} }, role: 'user' })
    const { POST } = await import('@/app/api/event-reviews/route')
    const response = await POST(new Request('https://dogdex.test/api/event-reviews', {
      method: 'POST',
      body: JSON.stringify({ event_id: 'event-1', rating: 0 }),
    }))
    expect(response.status).toBe(400)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })
})
