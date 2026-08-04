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

describe('review report safety', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('requires authentication before accepting a report', async () => {
    mocks.getServerUser.mockResolvedValue({ user: null, role: null })
    const { POST } = await import('@/app/api/review-reports/route')
    const response = await POST(new Request('https://dogdex.test/api/review-reports', {
      method: 'POST',
      body: JSON.stringify({ review_type: 'event', review_id: 'review-1', reason: 'spam' }),
    }))
    expect(response.status).toBe(401)
  })

  it('rejects unsupported report reasons before accessing the database', async () => {
    mocks.getServerUser.mockResolvedValue({ user: { id: 'user-1' }, role: 'user' })
    const { POST } = await import('@/app/api/review-reports/route')
    const response = await POST(new Request('https://dogdex.test/api/review-reports', {
      method: 'POST',
      body: JSON.stringify({ review_type: 'event', review_id: 'review-1', reason: 'revenge' }),
    }))
    expect(response.status).toBe(400)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('allows only administrators to list reports', async () => {
    mocks.getServerUser.mockResolvedValue({ user: { id: 'user-1' }, role: 'user' })
    const { GET } = await import('@/app/api/review-reports/route')
    const response = await GET()
    expect(response.status).toBe(403)
  })
})
